import { useQuery } from '@powersync/react-native';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { DayStepper } from '@/components/DayStepper';
import { Field } from '@/components/Field';
import { PrimaryButton } from '@/components/PrimaryButton';
import { createGuard } from '@/lib/guard';
import { cancelRest, deliverLine, ORDER_LINE_SQL, type OrderLine } from '@/orders/orderRepo';
import { lineState, validateDelivery } from '@/orders/orderRules';
import { purchaseDate } from '@/purchases/purchaseRules';
import { font } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

// Deliver part of an order line, or cancel the rest (spec 4.6).
export default function OrderLineScreen() {
  const t = useTheme();
  const { lineId } = useLocalSearchParams<{ lineId: string }>();
  const query = useQuery<OrderLine>(ORDER_LINE_SQL, [lineId]);
  const line = query.data[0];
  if (!line)
    return (
      <Text style={{ flex: 1, padding: 16, color: t.textSecondary, backgroundColor: t.bg }}>
        {query.isLoading ? 'Loading…' : 'This order line no longer exists'}
      </Text>
    );
  return <Deliver line={line} />;
}

function Deliver({ line }: { line: OrderLine }) {
  const t = useTheme();
  const [now] = useState(() => new Date());
  const [day, setDay] = useState(() => now.toISOString());
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));
  const { open, status } = lineState(line);
  const quantity = typed ?? String(open);

  const allowLeave = usePreventRemove(typed !== null, ({ repeat }) =>
    Alert.alert('Discard this delivery?', undefined, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ])
  );

  function onSave() {
    const result = validateDelivery(quantity, open, line.sold_by_weight === 1, day, line.ordered_on);
    if (!result.ok) return setError(result.error);
    return guard.run(async () => {
      await deliverLine(line.id, result.quantity, purchaseDate(day, new Date()));
      allowLeave();
      router.back();
    });
  }

  function onCancel() {
    Alert.alert(`Cancel ${open} ${line.unit}? It counts as refunded.`, undefined, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel the rest',
        style: 'destructive',
        onPress: () =>
          guard.run(async () => {
            await cancelRest(line.id);
            allowLeave();
            router.back();
          }),
      },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: line.name }} />
      <Text style={{ fontSize: font.body, color: t.textSecondary, marginBottom: 12 }}>
        {line.quantity} {line.unit} ordered · {status}
      </Text>
      {open > 0 ? (
        <>
          <Field
            label={`Arrived (${line.unit})`}
            value={quantity}
            onChangeText={(v) => {
              setTyped(v);
              setError(null);
            }}
            decimal
            error={error ?? undefined}
          />
          <View style={{ marginBottom: 12 }}>
            <DayStepper value={day} onChange={setDay} now={now} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PrimaryButton label="Save delivery" onPress={onSave} />
            <PrimaryButton label="Cancel the rest" variant="outline" onPress={onCancel} />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
