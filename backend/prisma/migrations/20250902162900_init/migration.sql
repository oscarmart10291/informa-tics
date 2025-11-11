/*
  Warnings:

  - Changed the type of `tipoEntrega` on the `PedidoCliente` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."TipoEntrega" AS ENUM ('LOCAL', 'DOMICILIO');

-- CreateEnum
CREATE TYPE "public"."DeliveryStatus" AS ENUM ('PEND_PREPARACION', 'EN_PREPARACION', 'LISTO_PARA_ENTREGA', 'ASIGNADO_A_REPARTIDOR', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO');

-- DropIndex
DROP INDEX "public"."PedidoCliente_repartidorId_estado_idx";

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryStatus" "public"."DeliveryStatus" NOT NULL DEFAULT 'PEND_PREPARACION',
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5)),
DROP COLUMN "tipoEntrega",
ADD COLUMN     "tipoEntrega" "public"."TipoEntrega" NOT NULL;

-- CreateTable
CREATE TABLE "public"."ObservacionEntrega" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "repartidorId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservacionEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObservacionEntrega_pedidoId_createdAt_idx" ON "public"."ObservacionEntrega"("pedidoId", "createdAt");

-- CreateIndex
CREATE INDEX "ObservacionEntrega_repartidorId_createdAt_idx" ON "public"."ObservacionEntrega"("repartidorId", "createdAt");

-- CreateIndex
CREATE INDEX "PedidoCliente_repartidorId_deliveryStatus_idx" ON "public"."PedidoCliente"("repartidorId", "deliveryStatus");

-- CreateIndex
CREATE INDEX "PedidoCliente_deliveryStatus_readyAt_idx" ON "public"."PedidoCliente"("deliveryStatus", "readyAt");

-- AddForeignKey
ALTER TABLE "public"."ObservacionEntrega" ADD CONSTRAINT "ObservacionEntrega_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "public"."PedidoCliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ObservacionEntrega" ADD CONSTRAINT "ObservacionEntrega_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "public"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
