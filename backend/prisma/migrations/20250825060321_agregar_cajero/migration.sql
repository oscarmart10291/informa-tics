/*
  Warnings:

  - The `estado` column on the `Orden` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."OrdenEstado" AS ENUM ('EN_ESPERA', 'EN_PREPARACION', 'TERMINADA', 'PENDIENTE_PAGO', 'PAGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "public"."MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA');

-- AlterTable
ALTER TABLE "public"."Orden" ADD COLUMN     "totalPagado" DOUBLE PRECISION,
ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5)),
DROP COLUMN "estado",
ADD COLUMN     "estado" "public"."OrdenEstado" NOT NULL DEFAULT 'EN_ESPERA';

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."TicketVenta" (
    "id" SERIAL NOT NULL,
    "ordenId" INTEGER NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metodoPago" "public"."MetodoPago" NOT NULL,
    "totalAPagar" DOUBLE PRECISION NOT NULL,
    "montoRecibido" DOUBLE PRECISION NOT NULL,
    "cambio" DOUBLE PRECISION NOT NULL,
    "posCorrelativo" TEXT,
    "clienteNombre" TEXT,

    CONSTRAINT "TicketVenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketVenta_ordenId_key" ON "public"."TicketVenta"("ordenId");

-- CreateIndex
CREATE INDEX "TicketVenta_fechaPago_idx" ON "public"."TicketVenta"("fechaPago");

-- CreateIndex
CREATE INDEX "Orden_estado_idx" ON "public"."Orden"("estado");

-- AddForeignKey
ALTER TABLE "public"."TicketVenta" ADD CONSTRAINT "TicketVenta_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "public"."Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
