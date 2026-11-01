import { column, Schema, Table } from '@powersync/react-native';

// Booleans are integer 0/1, dates are ISO text, money is integer cents. `id` is added by PowerSync.

const items = new Table({
  name: column.text,
  unit: column.text,
  category: column.text,
  buy_mode: column.text,
  buffer_pct: column.integer,
  max_months_cover: column.real,
  est_monthly_usage: column.real,
  pack_size: column.real,
  contents_qty: column.real, // how much one of it holds (groups spec 5.1)
  contents_unit: column.text, // 'kg' | 'L' | a count word such as 'roll'
  sold_by_weight: column.integer,
  active: column.integer,
  created_at: column.text,
});

const stores = new Table({
  name: column.text,
  is_city: column.integer,
  notes: column.text,
});

const purchases = new Table(
  {
    item_id: column.text,
    store_id: column.text,
    date: column.text,
    quantity: column.real,
    total_price_cents: column.integer,
    trip_id: column.text,
    is_emergency: column.integer,
    is_special: column.integer,
    regular_price_cents: column.integer,
    special_note: column.text,
    pack_count: column.integer,
    order_line_id: column.text, // set when the purchase is a delivery of an order line (spec 4.6)
  },
  { indexes: { item: ['item_id'], order_line: ['order_line_id'] } }
);

const stock_counts = new Table(
  {
    item_id: column.text,
    date: column.text,
    quantity: column.real,
    source: column.text,
    entered_packs: column.integer,
  },
  { indexes: { item: ['item_id'] } }
);

const trips = new Table({
  date: column.text,
  store_id: column.text,
  fuel_cents: column.integer,
  toll_cents: column.integer,
  parking_cents: column.integer,
  other_cents: column.integer,
  notes: column.text,
  kind: column.text, // 'drive' | 'delivery'; null on trips from before 5b means drive
  delivery_cents: column.integer,
});

// One line per item on a delivery order. Delivered quantity is the sum of its purchases, never stored.
const order_lines = new Table(
  {
    trip_id: column.text,
    item_id: column.text,
    quantity: column.real,
    total_price_cents: column.integer,
    cancelled_qty: column.real,
    created_at: column.text,
  },
  { indexes: { trip: ['trip_id'] } }
);

const settings = new Table({
  currency_symbol: column.text,
  default_buffer_pct: column.integer,
  usage_window_months: column.integer,
});

// One phone's preferences, never shared or backed up (phase 7 shares `settings`).
const device_prefs = new Table({ theme_mode: column.text }, { localOnly: true });

const list_entries = new Table(
  {
    item_id: column.text,
    group_id: column.text, // set for a group entry (groups spec 5.1); item_id is then null
    quantity: column.real,
    added_manually: column.integer,
    ticked: column.integer,
    ticked_at: column.text,
    ticked_by: column.text,
  },
  { indexes: { item: ['item_id'] } }
);

// The owner's own categories; the built-in list lives in code (src/categories).
const categories = new Table({
  name: column.text,
  created_at: column.text,
});

// "Who it's for" (groups spec 5.1); Home is built in, like the categories.
const people = new Table({
  name: column.text,
  created_at: column.text,
});

// Interchangeable groups. Not `groups`: that clashes with the SQL keyword.
const item_groups = new Table({
  kind: column.text,
  person: column.text,
  base_unit: column.text,
  buy_mode: column.text,
  buffer_pct: column.integer,
  max_months_cover: column.real,
  est_monthly_usage: column.real,
  active: column.integer,
  created_at: column.text,
});

const item_group_members = new Table(
  {
    group_id: column.text,
    item_id: column.text,
  },
  { indexes: { group: ['group_id'], item: ['item_id'] } }
);

export const AppSchema = new Schema({
  items,
  stores,
  purchases,
  stock_counts,
  trips,
  settings,
  device_prefs,
  list_entries,
  categories,
  people,
  item_groups,
  item_group_members,
  order_lines,
});

export type Database = (typeof AppSchema)['types'];
export type ItemRecord = Database['items'];
