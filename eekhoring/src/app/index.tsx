import { useQuery } from '@powersync/react-native';
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  // Temporary Task 2 check: proves the database opens. Replaced by the Items list in Task 5.
  const { data, error } = useQuery<{ n: number }>('SELECT count(*) AS n FROM items');
  return (
    <View style={styles.container}>
      <Text>{error ? `DB error: ${error.message}` : `Items in database: ${data[0]?.n ?? '…'}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
