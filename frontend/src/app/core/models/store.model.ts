export interface Store {
  id: number;
  name: string;
  ownerId: number;
  status: 'OPEN' | 'CLOSED' | 'PENDING_APPROVAL';
}
