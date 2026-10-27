import { Field } from '@/components/Field';
import type { CostForm } from '@/trips/tripRules';

// Fuel, toll, parking and Other (spec 4.6) for one trip, or the delivery fee and Other for an order; shared by Complete trip and the trip screen.
export function TripCostFields({
  kind,
  form,
  onChange,
  errors,
}: {
  kind: 'drive' | 'delivery';
  form: CostForm;
  onChange: (key: keyof CostForm, value: string) => void;
  errors: Partial<Record<keyof CostForm, string>>;
}) {
  const money = (key: keyof CostForm, label: string) => (
    <Field label={label} value={form[key]} onChangeText={(v) => onChange(key, v)} error={errors[key]} decimal placeholder="0" />
  );
  return (
    <>
      {kind === 'delivery' ? (
        money('delivery', 'Delivery fee')
      ) : (
        <>
          {money('fuel', 'Fuel')}
          {money('toll', 'Toll')}
          {money('parking', 'Parking')}
        </>
      )}
      {money('other', 'Other')}
      <Field label="Other note (optional)" value={form.note} onChangeText={(v) => onChange('note', v)} placeholder="e.g. lunch on the road" />
    </>
  );
}
