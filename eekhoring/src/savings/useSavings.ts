import { useQuery } from '@powersync/react-native';

import { TRIPS_SQL } from '@/trips/tripRepo';
import { tripCost } from '@/trips/tripRules';

import { tripSavings, type P } from './savingsRules';

export type SavingsPurchase = P & { trip_id: string | null; name: string; unit: string; sold_by_weight: number; category: string };
export type TripRow = {
  id: string;
  date: string;
  fuel_cents: number;
  toll_cents: number;
  parking_cents: number;
  other_cents: number;
  notes: string | null;
  shops: string | null;
  purchases: number;
};

// shortcut: loads every purchase to work out normal prices, fine for a few thousand rows; aggregate in SQL if Savings gets slow
export function useSavings() {
  const purchases = useQuery<SavingsPurchase>(
    `SELECT p.id, p.item_id, p.store_id, s.is_city, p.date, p.quantity, p.total_price_cents, p.is_special, p.is_emergency,
            p.regular_price_cents, p.trip_id, i.name, i.unit, i.sold_by_weight, i.category
     FROM purchases p JOIN stores s ON s.id = p.store_id JOIN items i ON i.id = p.item_id`
  );
  const stores = useQuery<{ id: string; is_city: number }>('SELECT id, is_city FROM stores');
  const trips = useQuery<TripRow>(TRIPS_SQL);
  const isLoading = purchases.isLoading || stores.isLoading || trips.isLoading;

  const savingsOf = (t: TripRow) =>
    tripSavings(
      purchases.data.filter((p) => p.trip_id === t.id),
      purchases.data,
      stores.data,
      tripCost(t)
    );
  return { purchases: purchases.data, stores: stores.data, trips: trips.data, savingsOf, isLoading };
}
