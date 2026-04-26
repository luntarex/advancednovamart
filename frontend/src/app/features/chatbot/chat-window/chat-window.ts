import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessage } from '../../../core/models/chat.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ChatService } from '../../../core/services/chat/chat.service';

type AgentStepState = 'pending' | 'active' | 'done' | 'failed';

type AgentStep = {
  label: string;
  state: AgentStepState;
};

type VisualizationPreview = {
  title: string;
  labels: string[];
  values: number[];
};

@Component({
  selector: 'app-chat-window',
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './chat-window.html',
  styleUrl: './chat-window.css',
})
export class ChatWindow implements OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly auth = inject(AuthService);
  private progressTimer: number | null = null;
  private streamTimer: number | null = null;

  readonly role = computed(() => this.auth.getUserRole() ?? 'INDIVIDUAL');
  readonly userId = computed(() => this.auth.getUserId() ?? 'guest');

  readonly isChatOpen = signal(false);
  readonly draftQuestion = signal('');
  readonly isSending = signal(false);
  readonly errorMessage = signal('');
  readonly sessionId = signal(this.getOrCreateSessionId());
  readonly messages = signal<ChatMessage[]>([]);
  readonly agentSteps = signal<AgentStep[]>([
    { label: 'Guardrails Scope Check', state: 'pending' },
    { label: 'SQL Query Generation', state: 'pending' },
    { label: 'Secure Query Execution', state: 'pending' },
    { label: 'Result Analysis', state: 'pending' },
    { label: 'Visualization Planning', state: 'pending' },
  ]);

  readonly quickPrompts = computed(() => {
    switch (this.role()) {
      case 'ADMIN':
        return [
          'Show top 5 stores by revenue this month.',
          'Compare fulfilled vs canceled orders by store.',
          'List users with unusual ordering activity.',
        ];
      case 'CORPORATE':
        return [
          'Show my store revenue trend for last 30 days.',
          'Which products are low stock and high demand?',
          'Summarize delayed shipments by city.',
        ];
      default:
        return [
          'Show my last 5 orders.',
          'How much did I spend this month?',
          'Which category do I buy the most?',
        ];
    }
  });

  readonly scopeMessage = computed(() => {
    switch (this.role()) {
      case 'ADMIN':
        return 'Admin scope: full platform analytics access.';
      case 'CORPORATE':
        return 'Corporate scope: your own store data only.';
      default:
        return 'Individual scope: your own orders, spending, and reviews.';
    }
  });

  readonly lastVisualizationCode = computed(() => {
    const reversed = [...this.messages()].reverse();
    const found = reversed.find((message) => message.visualizationCode);
    return found?.visualizationCode ?? '';
  });
  readonly visualizationPreview = computed(() => this.parseVisualizationCode(this.lastVisualizationCode()));
  readonly visualizationMax = computed(() => Math.max(1, ...(this.visualizationPreview()?.values ?? [1])));

  constructor() {
    this.loadHistory();
    if (this.messages().length === 0) {
      this.messages.set([
        {
          id: this.createId(),
          role: 'assistant',
          content:
            'Hello! I am your analytics assistant. Ask me about orders, revenue, customers, shipments, and reviews within your role scope.',
          timestamp: new Date(),
        },
      ]);
      this.persistHistory();
    }
  }

  ngOnDestroy(): void {
    this.clearProgressTimer();
    this.clearStreamTimer();
  }

  sendPrompt(prompt: string): void {
    this.draftQuestion.set(prompt);
    this.send();
  }

  toggleChat(): void {
    this.isChatOpen.update((v) => !v);
  }

  send(): void {
    const question = this.draftQuestion().trim();
    if (!question || this.isSending()) {
      return;
    }

    this.errorMessage.set('');
    this.isSending.set(true);
    this.draftQuestion.set('');
    this.pushMessage({
      id: this.createId(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    });

    this.startAgentProgress();
    const scopedQuestion = this.toScopedQuestion(question);

    this.chatService.ask({ question: scopedQuestion, sessionId: this.sessionId() }).subscribe({
      next: (response) => {
        this.streamAssistantMessage(
          response.answer || 'I could not generate a detailed response.',
          response.visualizationCode,
        );
      },
      error: () => {
        this.pushMessage({
          id: this.createId(),
          role: 'assistant',
          content:
            'The live AI service is currently unavailable. I saved your chat session and you can retry. For now, I can still guide you based on your role scope.',
          timestamp: new Date(),
        });
        this.errorMessage.set('Chat service unavailable right now. Showing fallback assistant response.');
        this.finishAgentProgress(false);
        this.isSending.set(false);
      },
    });
  }

  clearConversation(): void {
    this.messages.set([]);
    this.errorMessage.set('');
    this.sessionId.set(this.getOrCreateSessionId(true));
    this.agentSteps.set(this.agentSteps().map((step) => ({ ...step, state: 'pending' })));
    this.persistHistory();
  }

  trackByMessageId(_: number, message: ChatMessage): string {
    return message.id;
  }

  private pushMessage(message: ChatMessage): void {
    this.messages.update((current) => [...current, message].slice(-60));
    this.persistHistory();
  }

  private toScopedQuestion(question: string): string {
    return `[role:${this.role()}] ${question}`;
  }

  private startAgentProgress(): void {
    this.clearProgressTimer();
    const labels = this.agentSteps().map((step) => step.label);
    let activeIndex = 0;

    this.agentSteps.set(
      labels.map((label, index) => ({
        label,
        state: index === 0 ? 'active' : 'pending',
      })),
    );

    this.progressTimer = window.setInterval(() => {
      activeIndex = Math.min(activeIndex + 1, labels.length - 1);
      this.agentSteps.set(
        labels.map((label, index) => {
          if (index < activeIndex) {
            return { label, state: 'done' as AgentStepState };
          }
          if (index === activeIndex) {
            return { label, state: 'active' as AgentStepState };
          }
          return { label, state: 'pending' as AgentStepState };
        }),
      );
    }, 700);
  }

  private finishAgentProgress(success: boolean): void {
    this.clearProgressTimer();
    const lastIndex = this.agentSteps().length - 1;
    this.agentSteps.set(
      this.agentSteps().map((step, index) => ({
        ...step,
        state: success || index < lastIndex ? 'done' : 'failed',
      })),
    );
  }

  private clearProgressTimer(): void {
    if (this.progressTimer !== null) {
      window.clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private clearStreamTimer(): void {
    if (this.streamTimer !== null) {
      window.clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
  }

  private streamAssistantMessage(answer: string, visualizationCode?: string): void {
    this.clearStreamTimer();
    const messageId = this.createId();
    const fullText = answer.trim();
    this.pushMessage({
      id: messageId,
      role: 'assistant',
      content: '',
      visualizationCode,
      timestamp: new Date(),
    });

    let currentLength = 0;
    const step = Math.max(1, Math.ceil(fullText.length / 40));

    this.streamTimer = window.setInterval(() => {
      currentLength = Math.min(fullText.length, currentLength + step);
      this.messages.update((messages) =>
        messages.map((message) =>
          message.id === messageId ? { ...message, content: fullText.slice(0, currentLength) } : message,
        ),
      );
      this.persistHistory();

      if (currentLength >= fullText.length) {
        this.clearStreamTimer();
        this.finishAgentProgress(true);
        this.isSending.set(false);
      }
    }, 28);
  }

  widthByVisualization(value: number): number {
    return (value / this.visualizationMax()) * 100;
  }

  private parseVisualizationCode(code: string): VisualizationPreview | null {
    if (!code.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(code);
      if (
        Array.isArray(parsed?.labels) &&
        Array.isArray(parsed?.values) &&
        parsed.labels.length > 0 &&
        parsed.labels.length === parsed.values.length
      ) {
        const labels = parsed.labels.map((label: unknown) => String(label));
        const values = parsed.values.map((value: unknown) => Number(value)).map((value: number) => (Number.isFinite(value) ? value : 0));
        return {
          title: String(parsed?.title ?? 'Visualization Preview'),
          labels,
          values,
        };
      }
    } catch {
      // Continue with line parser fallback
    }

    const lineMatches = code
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes(':'))
      .map((line) => {
        const [label, value] = line.split(':');
        return {
          label: label.trim(),
          value: Number(value.trim()),
        };
      })
      .filter((item) => item.label.length > 0 && Number.isFinite(item.value));

    if (lineMatches.length === 0) {
      return null;
    }

    return {
      title: 'Visualization Preview',
      labels: lineMatches.map((item) => item.label),
      values: lineMatches.map((item) => item.value),
    };
  }

  private getOrCreateSessionId(forceNew = false): string {
    const key = `novamart_chat_session_${this.userId()}`;
    if (!forceNew) {
      const existing = localStorage.getItem(key);
      if (existing) {
        return existing;
      }
    }

    const created = `session_${this.userId()}_${Date.now()}`;
    localStorage.setItem(key, created);
    return created;
  }

  private loadHistory(): void {
    const key = `novamart_chat_history_${this.userId()}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>;
      const normalized = parsed.map((item) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }));
      this.messages.set(normalized.slice(-60));
    } catch {
      this.messages.set([]);
    }
  }

  private persistHistory(): void {
    const key = `novamart_chat_history_${this.userId()}`;
    const storable = this.messages().map((message) => ({
      ...message,
      timestamp: message.timestamp.toISOString(),
    }));
    localStorage.setItem(key, JSON.stringify(storable));
  }

  private createId(): string {
    return `msg_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }
}
