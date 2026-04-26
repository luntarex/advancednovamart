import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ChatService } from '../../../core/services/chat/chat.service';

import { ChatWindow } from './chat-window';

describe('ChatWindow', () => {
  let component: ChatWindow;
  let fixture: ComponentFixture<ChatWindow>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatWindow],
      providers: [
        {
          provide: AuthService,
          useValue: {
            getUserRole: () => 'INDIVIDUAL',
            getUserId: () => '14',
          },
        },
        {
          provide: ChatService,
          useValue: {
            ask: () => of({ answer: 'ok' }),
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatWindow);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
