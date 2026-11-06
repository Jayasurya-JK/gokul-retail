import {
  BarChart3, Barcode, Boxes, ClipboardList, Factory, LayoutDashboard, Package, Receipt, Settings, ShieldCheck, ShoppingCart, Tags, Truck, Users, Wallet,
} from 'lucide-react';
import type { NavGroup } from '@gokul/ui';

export const nav: NavGroup[] = [
  { title: 'Overview', items: [{ path: '/', label: 'Dashboard', icon: <LayoutDashboard />, keywords: 'home today sales' }] },
  {
    title: 'Catalogue',
    items: [
      { path: '/items', label: 'Items', icon: <Package />, keywords: 'products barcode price gst' },
      { path: '/categories', label: 'Categories and brands', icon: <Tags /> },
      { path: '/labels', label: 'Barcode labels', icon: <Barcode />, keywords: 'print stickers' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { path: '/stock', label: 'Stock', icon: <Boxes />, keywords: 'levels adjustment stock take' },
      { path: '/purchases', label: 'Purchases', icon: <ShoppingCart />, keywords: 'grn entry' },
      { path: '/suppliers', label: 'Suppliers', icon: <Truck /> },
      { path: '/production', label: 'Production', icon: <Factory />, keywords: 'pressing batch packing seeds' },
      { path: '/mill', label: 'Mill daily sheet', icon: <ClipboardList />, keywords: 'aravai operator punnaku stock paper form day end' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { path: '/sales', label: 'Bills', icon: <Receipt />, keywords: 'sales invoices' },
      { path: '/customers', label: 'Customers', icon: <Users /> },
      { path: '/collections', label: 'Credit and collections', icon: <Wallet />, keywords: 'ledger outstanding' },
    ],
  },
  { title: 'Money', items: [{ path: '/expenses', label: 'Expenses', icon: <Wallet />, keywords: 'petty cash tea transport wages rent categories' }] },
  { title: 'Insights', items: [{ path: '/reports', label: 'Reports', icon: <BarChart3 />, keywords: 'gst gstr hsn profit cash' }] },
  {
    title: 'Admin',
    items: [
      { path: '/users', label: 'Users and roles', icon: <ShieldCheck /> },
      { path: '/settings', label: 'Settings', icon: <Settings />, keywords: 'shop tax printer backup' },
    ],
  },
];

export interface ScreenInfo { path: string; title: string; subtitle: string; tabs?: string[]; action?: string; hint: string }

/** Wave 2 screens: everything routes and has a header now, content follows. */
export const placeholders: ScreenInfo[] = [
  { path: '/categories', title: 'Categories and brands', subtitle: 'Group items for billing and reports', action: 'New category', hint: 'Two side-by-side lists with inline edit.' },
  { path: '/labels', title: 'Barcode labels', subtitle: 'Print stickers for shelves and packs', action: 'Print labels', hint: 'Pick items, label size and copies, with a live label preview.' },
  { path: '/stock', title: 'Stock', subtitle: 'Levels, adjustments and stock take', tabs: ['Levels', 'Adjustments', 'Stock take'], action: 'New adjustment', hint: 'Live stock per item with low-stock filters.' },
  { path: '/purchases', title: 'Purchases', subtitle: 'Goods received from suppliers', tabs: ['All purchases', 'New entry (GRN)'], action: 'New purchase', hint: 'Purchase list with supplier, amount and payment status.' },
  { path: '/suppliers', title: 'Suppliers', subtitle: 'Who you buy from, and what you owe', action: 'New supplier', hint: 'Supplier list with ledger on the right.' },
  { path: '/production', title: 'Production', subtitle: 'Pressing batches and packing', tabs: ['Pressing', 'Packing'], action: 'New batch', hint: 'Seeds in, oil and cake out. Loose oil into bottles and tins.' },
  { path: '/sales', title: 'Bills', subtitle: 'Every bill from every counter', action: 'Export', hint: 'Bills list with a bill detail panel and reprint.' },
  { path: '/customers', title: 'Customers', subtitle: 'People who buy from you', action: 'New customer', hint: 'Customer list, purchase history and credit.' },
  { path: '/collections', title: 'Credit and collections', subtitle: 'Outstanding balances and payments received', action: 'Record payment', hint: 'Who owes what, oldest first.' },
  { path: '/reports', title: 'Reports', subtitle: 'Sales, GST, stock, profit and cash', tabs: ['Sales', 'Item-wise', 'GST (GSTR-1, 3B, HSN)', 'Stock', 'Profit', 'Day-wise cash'], action: 'Export', hint: 'Pick a report, set the dates, export to Excel or PDF.' },
  { path: '/users', title: 'Users and roles', subtitle: 'Who can do what', action: 'New user', hint: 'Users, PINs and role permissions.' },
  { path: '/settings', title: 'Settings', subtitle: 'Shop, tax, bill format, printers and backup', tabs: ['Shop', 'Tax', 'Bill format', 'Printers', 'Backup'], action: 'Save changes', hint: 'Shop details, GST, receipt layout, printers and backup schedule.' },
  { path: '/items/new', title: 'New item', subtitle: 'Barcodes, units, loose or packed, GST, MRP and prices', action: 'Save item', hint: 'Item editor.' },
];
