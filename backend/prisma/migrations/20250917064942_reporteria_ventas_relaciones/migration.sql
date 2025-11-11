-- CreateEnum
CREATE TYPE "public"."ComprobanteEstado" AS ENUM ('VALIDO', 'ANULADO');

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."TicketVenta" ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoMotivo" TEXT,
ADD COLUMN     "anuladoPorId" INTEGER,
ADD COLUMN     "cajeroId" INTEGER,
ADD COLUMN     "descuentos" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "estado" "public"."ComprobanteEstado" NOT NULL DEFAULT 'VALIDO',
ADD COLUMN     "impuestos" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "TicketVenta_estado_fechaPago_idx" ON "public"."TicketVenta"("estado", "fechaPago");

-- CreateIndex
CREATE INDEX "TicketVenta_cajeroId_fechaPago_idx" ON "public"."TicketVenta"("cajeroId", "fechaPago");

-- AddForeignKey
ALTER TABLE "public"."TicketVenta" ADD CONSTRAINT "TicketVenta_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketVenta" ADD CONSTRAINT "TicketVenta_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
