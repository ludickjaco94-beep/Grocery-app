import { Text, View } from 'react-native';

import { Chip } from '@/components/CategoryChips';
import { Field, SwitchRow } from '@/components/Field';
import { parseDecimal } from '@/items/itemRules';
import { font } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

import { formatMoney, parseMoney, unitPriceCents, type PurchaseFormState } from './purchaseRules';

// Fields only; the screen adds its own buttons.
export function PurchaseForm({
  form,
  onChange,
  errors,
  soldByWeight,
  unit,
  symbol,
}: {
  form: PurchaseFormState;
  onChange: (f: PurchaseFormState) => void;
  errors: Partial<Record<keyof PurchaseFormState, string>>;
  soldByWeight: boolean;
  unit: string;
  symbol: string;
}) {
  const t = useTheme();
  const set = <K extends keyof PurchaseFormState>(key: K, value: PurchaseFormState[K]) => onChange({ ...form, [key]: value });

  const qty = parseDecimal(form.quantity);
  const price = parseMoney(form.price);
  const perUnit =
    typeof qty === 'number' && qty > 0 && typeof price === 'number' && price > 0
      ? soldByWeight || form.priceMode === 'total'
        ? unitPriceCents(price, qty)
        : price
      : null;

  return (
    <View>
      <Field
        label={soldByWeight ? `${unit === 'L' ? 'Volume' : 'Weight'} (${unit})` : `Quantity (${unit})`}
        value={form.quantity}
        onChangeText={(v) => set('quantity', v)}
        error={errors.quantity}
        decimal
      />
      {soldByWeight ? null : (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <Chip label="Total" on={form.priceMode === 'total'} onPress={() => set('priceMode', 'total')} />
          <Chip label={`Per ${unit}`} on={form.priceMode === 'unit'} onPress={() => set('priceMode', 'unit')} />
        </View>
      )}
      <Field
        label={soldByWeight || form.priceMode === 'total' ? 'Price paid (total)' : `Price per ${unit}`}
        value={form.price}
        onChangeText={(v) => set('price', v)}
        error={errors.price}
        hint={perUnit === null ? undefined : `${formatMoney(Math.round(perUnit), symbol)} per ${unit}`}
        decimal
      />
      {soldByWeight ? (
        <Field
          label="Packs (optional)"
          value={form.packs}
          onChangeText={(v) => set('packs', v)}
          error={errors.packs}
          hint="Lets you count this item in packs at stock-take"
          decimal
        />
      ) : null}
      <SwitchRow label="Special price" value={form.special} onValueChange={(v) => set('special', v)} />
      {form.special ? (
        <>
          <Field
            label={`Normal price per ${unit} (optional)`}
            value={form.normalPrice}
            onChangeText={(v) => set('normalPrice', v)}
            error={errors.normalPrice}
            decimal
          />
          <Field label="Note (optional)" value={form.note} onChangeText={(v) => set('note', v)} placeholder="e.g. 3 for 2" />
          <Text style={{ fontSize: font.caption, color: t.textSecondary, marginTop: -8, marginBottom: 12 }}>
            Specials never count as the normal price.
          </Text>
        </>
      ) : null}
      <SwitchRow label="Emergency (ran out, bought locally)" value={form.emergency} onValueChange={(v) => set('emergency', v)} />
    </View>
  );
}
