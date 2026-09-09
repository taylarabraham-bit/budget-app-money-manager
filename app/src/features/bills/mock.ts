import { daysFromNow } from './dates';
import type { Bill } from './types';

// Sample bills for the household until Supabase is wired. Due dates are
// relative to "now" so the Overdue / Due today / Next 7 days sections always
// have something in them. Category and member ids match app/src/data/mock.ts.

export function sampleBills(now: Date = new Date()): Bill[] {
  const due = (days: number) => daysFromNow(days, now);
  const createdAt = new Date(now.getTime() - 40 * 86_400_000).toISOString();
  return [
    { id: 'b_rent', name: 'Rent', amount: 1450, frequency: 'monthly', nextDue: due(9), kind: 'bill', categoryId: 'c_home', memberId: 'm_priya', shared: true, accountId: 'a_everyday', lastPaid: daysFromNow(-21, now), createdAt },
    { id: 'b_power', name: 'Electricity', amount: 92.1, frequency: 'monthly', nextDue: due(-2), kind: 'bill', categoryId: 'c_home', memberId: 'm_priya', shared: true, accountId: 'a_everyday', lastPaid: daysFromNow(-33, now), createdAt },
    { id: 'b_phone', name: 'Phone plan', amount: 45, frequency: 'monthly', nextDue: due(0), kind: 'bill', categoryId: 'c_home', memberId: 'm_sam', createdAt },
    { id: 'b_internet', name: 'Internet', amount: 59.99, frequency: 'monthly', nextDue: due(5), kind: 'bill', categoryId: 'c_home', memberId: 'm_sam', shared: true, lastPaid: daysFromNow(-25, now), createdAt },
    { id: 'b_water', name: 'Water', amount: 41.2, frequency: 'monthly', nextDue: due(18), kind: 'bill', categoryId: 'c_home', memberId: 'm_priya', shared: true, lastPaid: daysFromNow(-12, now), createdAt },
    { id: 'b_car', name: 'Car insurance', amount: 310, frequency: 'quarterly', nextDue: due(26), kind: 'bill', categoryId: 'c_transport', memberId: 'm_sam', shared: true, createdAt },
    { id: 'b_netflix', name: 'Netflix', amount: 15.49, frequency: 'monthly', nextDue: due(3), kind: 'subscription', categoryId: 'c_subs', memberId: 'm_priya', shared: true, accountId: 'a_visa', lastPaid: daysFromNow(-27, now), createdAt },
    { id: 'b_spotify', name: 'Spotify family', amount: 16.99, frequency: 'monthly', nextDue: due(12), kind: 'subscription', categoryId: 'c_subs', memberId: 'm_sam', shared: true, accountId: 'a_visa', lastPaid: daysFromNow(-18, now), createdAt },
    { id: 'b_icloud', name: 'iCloud storage', amount: 2.99, frequency: 'monthly', nextDue: due(1), kind: 'subscription', categoryId: 'c_subs', memberId: 'm_priya', createdAt },
    { id: 'b_gym', name: 'Gym', amount: 12, frequency: 'weekly', nextDue: due(4), kind: 'subscription', categoryId: 'c_fun', memberId: 'm_sam', createdAt },
    { id: 'b_minecraft', name: 'Minecraft Realms', amount: 7.99, frequency: 'monthly', nextDue: due(40), kind: 'subscription', categoryId: 'c_fun', memberId: 'm_maya', note: 'Comes out of allowance', createdAt },
    { id: 'b_domain', name: 'Domain renewal', amount: 14, frequency: 'yearly', nextDue: due(150), kind: 'subscription', categoryId: 'c_subs', memberId: 'm_priya', createdAt },
    { id: 'b_hbo', name: 'Max', amount: 9.99, frequency: 'monthly', nextDue: due(-30), kind: 'subscription', categoryId: 'c_subs', memberId: 'm_sam', paused: true, note: 'Paused until the new season', createdAt },
  ];
}
