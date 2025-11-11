-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."OrdenItem" ADD COLUMN     "qty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "subtotal" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."TicketVenta" ADD COLUMN     "clienteNit" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "serie" TEXT,
ADD COLUMN     "snapshot" JSONB;

-- CreateIndex
CREATE INDEX "TicketVenta_metodoPago_fechaPago_idx" ON "public"."TicketVenta"("metodoPago", "fechaPago");
