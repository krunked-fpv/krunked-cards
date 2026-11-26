import type { VoucherDef } from '../contracts/index.ts';

export const VOUCHERS: VoucherDef[] = [
  {
    key: 'v_overstock_norm',
    name: 'Overstock',
    order: 1,
    tier: 1,
    cost: 10,
    pos: { x: 0, y: 0 },
    desc: '+1 card slot available in shop',
  },
  {
    key: 'v_overstock_plus',
    name: 'Overstock Plus',
    order: 2,
    tier: 2,
    requires: 'v_overstock_norm',
    cost: 10,
    pos: { x: 0, y: 1 },
    desc: '+1 card slot available in shop',
  },
  {
    key: 'v_hone',
    name: 'Hone',
    order: 5,
    tier: 1,
    cost: 10,
    pos: { x: 4, y: 0 },
    desc: 'Foil, Holographic, and Polychrome cards appear 2X more often',
  },
  {
    key: 'v_glow_up',
    name: 'Glow Up',
    order: 6,
    tier: 2,
    requires: 'v_hone',
    cost: 10,
    pos: { x: 4, y: 1 },
    desc: 'Foil, Holographic, and Polychrome cards appear 4X more often',
  },
  {
    key: 'v_grabber',
    name: 'Grabber',
    order: 13,
    tier: 1,
    cost: 10,
    pos: { x: 5, y: 0 },
    desc: 'Permanently gain +1 hand per round',
  },
  {
    key: 'v_nacho_tong',
    name: 'Nacho Tong',
    order: 14,
    tier: 2,
    requires: 'v_grabber',
    cost: 10,
    pos: { x: 5, y: 1 },
    desc: 'Permanently gain +1 hand per round',
  },
];

export const VOUCHER_MAP: Record<string, VoucherDef> = Object.fromEntries(
  VOUCHERS.map((v) => [v.key, v])
);
