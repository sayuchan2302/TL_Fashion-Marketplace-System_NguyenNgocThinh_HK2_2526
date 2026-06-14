import type { Order } from '../types';

export const isOrderReturnWindowOpen = (
  order: Pick<Order, 'status' | 'escrowDeadlineAt'> | null | undefined,
): boolean => {
  if (!order || order.status !== 'delivered' || !order.escrowDeadlineAt) {
    return false;
  }

  const deadlineTime = new Date(order.escrowDeadlineAt).getTime();
  return Number.isFinite(deadlineTime) && deadlineTime > Date.now();
};
