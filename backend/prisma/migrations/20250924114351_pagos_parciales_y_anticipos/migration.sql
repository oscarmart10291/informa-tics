-- DropIndex
DROP INDEX "public"."TicketVenta_ordenId_key";

-- AlterTable
ALTER TABLE "public"."Orden" ADD COLUMN     "anticipo" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."OrdenItem" ADD COLUMN     "ticketVentaId" INTEGER;

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."TicketVenta" ADD COLUMN     "anticipoAplicado" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "public"."OrdenItem" ADD CONSTRAINT "OrdenItem_ticketVentaId_fkey" FOREIGN KEY ("ticketVentaId") REFERENCES "public"."TicketVenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
