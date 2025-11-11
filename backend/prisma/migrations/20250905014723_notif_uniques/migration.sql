/*
  Warnings:

  - A unique constraint covering the columns `[pedidoId,tipo]` on the table `RepartidorNotif` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateIndex
CREATE UNIQUE INDEX "uniq_notif_broadcast" ON "public"."RepartidorNotif"("pedidoId", "tipo");

-- RenameIndex
ALTER INDEX "public"."RepartidorNotif_pedidoId_repartidorId_tipo_key" RENAME TO "uniq_notif_by_user";
