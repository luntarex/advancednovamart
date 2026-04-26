export interface User {
  id: number;
  email: string;
  roleType: 'ADMIN' | 'CORPORATE' | 'INDIVIDUAL';
  gender?: string;
  createdAt?: string;
}
