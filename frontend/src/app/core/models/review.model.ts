export interface Review {
  id: number;
  userId: number;
  productId: number;
  productTitle?: string;
  starRating: number;
  reviewText?: string;
  sentiment?: string;
  helpfulVotes?: number;
  responseText?: string;
  visibility?: string;
  createdAt?: string;
}
