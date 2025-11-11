/*
  Warnings:

  - A unique constraint covering the columns `[ordenId]` on the table `PedidoCliente` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ADD COLUMN     "ordenId" INTEGER,
ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCliente_ordenId_key" ON "public"."PedidoCliente"("ordenId");

-- CreateIndex
CREATE INDEX "PedidoCliente_ordenId_idx" ON "public"."PedidoCliente"("ordenId");

-- AddForeignKey
ALTER TABLE "public"."PedidoCliente" ADD CONSTRAINT "PedidoCliente_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "public"."Orden"("id") ON DELETE SET NULL ON UPDATE CASCADE;
