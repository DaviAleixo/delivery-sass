import { createEntityModel } from "./storage";

export const RestaurantTable = createEntityModel("restaurant_tables", []);
export const TableSession = createEntityModel("table_sessions", []);
export const TableComanda = createEntityModel("table_comandas", []);
export const TablePayment = createEntityModel("table_payments", []);
export const TablePaymentAllocation = createEntityModel("table_payment_allocations", []);

