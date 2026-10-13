# shift-closing-report - Design Document

## Overview

The **Shift Closing & Daily Report** (`shift-closing-report`) feature provides restaurant managers and cashiers with a single-click, comprehensive financial and operational closure of the working shift. It automatically filters orders within the store's operating shift (including overnight shifts crossing midnight in the `America/Sao_Paulo` timezone), summarizes all sales by payment method, calculates cash drawer expectations, and reconciles delivery driver fees and collected cash.

The architecture emphasizes **Clean Code, Separation of Concerns, Deterministic Pure Logic, and Adaptive Presentation**:
- Pure calculation engine (`shiftClosingCalculator.js`) isolated from UI.
- Adaptive UI: cleanly presents driver settlements when drivers exist, and cleanly omits driver modules when the restaurant operates without delivery drivers.
- Thermal POS printer rendering reused from existing thermal receipt infrastructure (80mm & 58mm).
- One-click formatted WhatsApp text exporter for direct delivery to the restaurant owner.

---

## Architecture

```
                  ┌───────────────────────────────────────────────┐
                  │                 Orders Data                   │
                  │ (Supabase `orders` table + `tenants` configs) │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │        shiftClosingCalculator.js (Pure)       │
                  │  - Timezone & Shift Boundary Resolution       │
                  │  - Sales & Payment Aggregation                │
                  │  - Driver Fee & Cash Reconciliation Engine    │
                  └───────────────────────┬───────────────────────┘
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
        ┌───────────────────────────────┐   ┌───────────────────────────────┐
        │      Interactive Modal        │   │    Printable Thermal Slip     │
        │   `ShiftClosingModal.jsx`     │   │ `ShiftClosingThermalSlip.jsx` │
        │  - KPI Cards & Revenue        │   │  - Monochrome 80mm/58mm POS   │
        │  - Payment Methods Breakdown  │   │  - Receipts & Signatures      │
        │  - Adaptive Motoboy Cards     │   │  - Integrated with `Print`    │
        │  - Pix Key Copy & WhatsApp    │   └───────────────────────────────┘
        └───────────────────────────────┘
```

### Key Modules:
1. **`src/utils/shiftClosingCalculator.js`**:
   - Pure function `calculateShiftClosing({ orders, drivers, tenantSettings, customRange })`.
   - Resolves shift start time (e.g., 18:00) and whether current time is in the early morning of the next day.
   - Calculates totals, payment splits, driver trip groupings, and net balances.
2. **`src/components/admin/orders/ShiftClosingModal.jsx`**:
   - Responsive dialog opened from `Orders.jsx` (and accessible in `Reports.jsx`).
   - Renders summary badges, cash drawer balance, payment grid, and driver reconciliation cards.
3. **`src/components/admin/orders/ShiftClosingThermalSlip.jsx`**:
   - Standalone printable thermal receipt layout adhering to thermal paper standards (CSS `@media print`).
4. **`src/utils/shiftClosingWhatsAppFormatter.js`**:
   - Formats the entire closure into clean WhatsApp markdown with emojis.

---

## Components and Interfaces

### 1. Pure Calculator Interface (`shiftClosingCalculator.js`)

```typescript
export interface ShiftClosingOptions {
  orders: any[];
  drivers: any[];
  tenantSettings: any;
  customRange?: { start: Date; end: Date };
}

export interface ShiftClosingResult {
  shiftInfo: {
    startTime: string;
    endTime: string;
    shiftDateKey: string;
    isOvernight: boolean;
  };
  metrics: {
    grossRevenue: number;
    netRevenue: number;
    totalOrders: number;
    deliveryOrders: number;
    counterOrders: number;
    canceledOrders: number;
    averageTicket: number;
    totalDeliveryFeesCollected: number;
  };
  paymentBreakdown: {
    cash: { count: number; total: number };
    pix: { count: number; total: number };
    credit: { count: number; total: number };
    debit: { count: number; total: number };
    mealVoucher: { count: number; total: number };
    other: { count: number; total: number };
    total: number;
  };
  cashDrawer: {
    cashOrdersDirectTotal: number;
    cashToReceiveFromDrivers: number;
    expectedCashTotal: number;
  };
  driverSettlements: {
    hasDrivers: boolean;
    totalFeesToPay: number;
    totalCashToCollect: number;
    driversList: Array<{
      driverId: string;
      driverName: string;
      vehicle: string;
      feeType: 'per_order' | 'per_trip' | 'none';
      feeValue: number;
      ordersDelivered: number;
      tripsCompleted: number;
      feeEarned: number;
      cashCollectedFromCustomers: number;
      netBalance: number; // Positive = Store owes driver; Negative = Driver owes store
      pixKey?: string;
    }>;
  };
}
```

### 2. UI Modal Component (`ShiftClosingModal.jsx`)
- Props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `orders: any[]`
  - `drivers: any[]`
  - `tenantSettings: any`
- Displays:
  - Header with Shift Timeframe badge (e.g., "Turno de Hoje: 18:00 às 02:30").
  - Top Metric Cards: Faturamento Total, Pedidos Entregues, Ticket Médio, Dinheiro Esperado no Caixa.
  - Payment Methods Table / Badges.
  - **Adaptive Driver Section**:
    - If `hasDrivers` is false: completely hidden or replaced by a subtle informative card: *"Fechamento sem entregadores terceirizados"*.
    - If `hasDrivers` is true: individual driver cards showing trips, deliveries, fee, cash in hand, and final balance with Pix key copy button.
  - Footer Actions:
    - `[ 🖨️ Imprimir Cupom Térmico ]` (opens thermal receipt print preview).
    - `[ 📲 Copiar para WhatsApp ]` (copies formatted text with toast feedback).

### 3. Thermal Slip Component (`ShiftClosingThermalSlip.jsx`)
- Print-friendly component rendered in an invisible iframe or dedicated print popup.
- Uses strict 80mm/58mm `@media print` CSS rules:
  - High-contrast pure black text (`#000000`), bold labels, dashed dividing rules.
  - No colors, shadows, or background graphics that could print poorly on thermal rolls.
  - Cashier signature line and closing timestamp.

---

## Data Models

### Supabase Table: `shift_closings` (Optional Persistence / Historical Audit)
```sql
CREATE TABLE IF NOT EXISTS shift_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  shift_start timestamptz NOT NULL,
  shift_end timestamptz NOT NULL,
  gross_revenue numeric(10,2) NOT NULL DEFAULT 0.00,
  net_revenue numeric(10,2) NOT NULL DEFAULT 0.00,
  total_orders integer NOT NULL DEFAULT 0,
  payment_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  driver_settlements jsonb DEFAULT NULL,
  cash_drawer_expected numeric(10,2) NOT NULL DEFAULT 0.00,
  closed_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE shift_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admin shift closings isolation"
  ON shift_closings FOR ALL
  TO authenticated
  USING (tenant_id = (SELECT id FROM tenants WHERE ...));
```
*Note: The calculation runs in real-time in the frontend from active orders, so the feature works instantly with or without a saved database row.*

---

## Error Handling & Edge Cases

1. **Overnight Shift Rollover**:
   - Stores operating from 18:00 to 02:00: at 01:30 AM, `new Date()` is the next calendar day.
   - The engine checks if the store opened yesterday evening and compares timestamps against the operational shift window rather than naive calendar day matching.
2. **Missing or Inactive Drivers on Dispatched Orders**:
   - If an order was dispatched to a driver who was later removed from the tenant driver list, the engine falls back to `order.driver_name` and `order.driver_id` with 0 fee, so cash collected by that person is never lost.
3. **Orders with Zero or Incomplete Payment Info**:
   - All amounts are parsed safely via `Number(val || 0)`. Unspecified payment methods are categorized under `other` instead of throwing exceptions.
4. **Canceled Orders**:
   - Excluded from revenue and driver fee calculations, but counted in `canceledOrders` metric for auditing.
5. **Print CSS Compatibilities**:
   - Explicit page breaks (`page-break-inside: avoid;`) and overflow controls to avoid extra blank paper feeds on thermal POS printers.

---

## Testing Strategy

1. **Unit Testing Pure Calculations (`shiftClosingCalculator.test.js`)**:
   - Test 1: Mix of delivery and counter orders with Cash, PIX, and Credit Card payments.
   - Test 2: Multi-order trips with `per_trip` driver vs `per_order` driver.
   - Test 3: Cash collected by driver exceeding driver fee (driver owes cashier cash).
   - Test 4: Driver fee exceeding cash collected (cashier owes driver Pix/cash).
   - Test 5: Empty driver list (zero-driver restaurant mode).
2. **Visual & Print Testing**:
   - Validate 80mm thermal receipt layout with Chrome print preview.
   - Validate modal responsiveness on mobile (phone screen) and desktop.
3. **WhatsApp Text Verification**:
   - Verify that copied WhatsApp text has correct line breaks, clean spacing, and valid numbers.
