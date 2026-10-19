import { z } from "zod";

const money = z.number().finite().nonnegative().max(999999999).multipleOf(0.01);
const text = (max: number) => z.string().trim().min(1).max(max);
export const spektrotekMappingSchema = z.object({
  portalProductId: z.number().int().positive(),
  webProductId: text(120),
  webSlug: z.string().trim().max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
}).strict();

export const spektrotekOrderSchema = z.object({
  orderId: text(120).regex(/^[A-Za-z0-9_-]+$/),
  orderNumber: text(120),
  placedAt: z.string().datetime({ offset: true }),
  currency: z.enum(["TRY", "EUR", "USD", "GBP"]),
  customer: z.object({
    name: text(220), email: z.string().email().max(254), phone: text(80),
    billingAddress: text(2000), shippingAddress: text(2000),
    taxNumber: z.string().trim().max(40).optional(),
  }).strict(),
  items: z.array(z.object({
    portalProductId: z.number().int().positive(), webProductId: text(120),
    quantity: z.number().finite().positive().max(1000000).multipleOf(0.0001),
    unitPrice: money, vatRate: z.number().finite().min(0).max(100),
  }).strict()).min(1).max(100),
  shippingTotal: money, discountTotal: money, grandTotal: money,
  paymentStatus: z.enum(["pending", "paid", "bank_transfer", "cash_on_delivery"]),
  paymentReference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
}).strict().superRefine((order, ctx) => {
  const ids = order.items.map(item => item.portalProductId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Aynı ürün tek kalemde gönderilmeli.", path: ["items"] });
  // Prices are VAT-exclusive; round each line's VAT-inclusive total to cents.
  const total = order.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice * (1 + item.vatRate / 100) * 100), 0)
    + Math.round(order.shippingTotal * 100) - Math.round(order.discountTotal * 100);
  if (total < 0 || total !== Math.round(order.grandTotal * 100)) ctx.addIssue({ code: "custom", message: "Sipariş toplamı kalemlerle uyuşmuyor.", path: ["grandTotal"] });
});
