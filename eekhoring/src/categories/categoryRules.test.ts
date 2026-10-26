import { groupByCategory, orderedCategories, resolveCategory, validateNewCategory } from './categoryRules';

test('orderedCategories puts custom between built-ins and Other', () => {
  expect(orderedCategories(['baby', 'Alcohol']).map((c) => c.name)).toEqual([
    'Pantry',
    'Fridge',
    'Freezer',
    'Meat',
    'Fruit & veg',
    'Cleaning',
    'Toiletries',
    'Alcohol',
    'baby',
    'Other',
  ]);
});

test('resolveCategory matches built-ins ignoring case', () => {
  expect(resolveCategory(' meat ', [])).toBe('Meat');
  expect(resolveCategory('fruit & VEG', [])).toBe('Fruit & veg');
  expect(resolveCategory('alcohol', ['Alcohol'])).toBe('Alcohol');
  expect(resolveCategory('dairy', [])).toBe('Other');
  expect(resolveCategory('', [])).toBe('Other');
});

test('validateNewCategory refuses duplicates', () => {
  expect(validateNewCategory('  Baby  ', [])).toEqual({ ok: true, name: 'Baby' });
  expect(validateNewCategory('pantry', [])).toEqual({ ok: false, error: 'Pantry already exists' });
  expect(validateNewCategory('ALCOHOL', ['Alcohol'])).toEqual({ ok: false, error: 'Alcohol already exists' });
  expect(validateNewCategory('  ', [])).toEqual({ ok: false, error: 'Give the category a name' });
});

test('groupByCategory orders sections and filters', () => {
  const rows = [
    { id: '1', category: 'Other' },
    { id: '2', category: 'meat' },
    { id: '3', category: 'Pantry' },
  ];
  expect(groupByCategory(rows, [], null).map((s) => [s.title, s.data.map((r) => r.id)])).toEqual([
    ['Pantry', ['3']],
    ['Meat', ['2']],
    ['Other', ['1']],
  ]);
  expect(groupByCategory(rows, [], 'Meat').map((s) => s.title)).toEqual(['Meat']);
});
