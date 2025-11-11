/*
  Warnings:

  - A unique constraint covering the columns `[pedidoId,repartidorId,tipo]` on the table `RepartidorNotif` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."RepartidorNotif" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'GENERICA';

-- CreateIndex
CREATE UNIQUE INDEX "RepartidorNotif_pedidoId_repartidorId_tipo_key" ON "public"."RepartidorNotif"("pedidoId", "repartidorId", "tipo");
