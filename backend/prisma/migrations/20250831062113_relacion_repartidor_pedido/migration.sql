-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ADD COLUMN     "repartidorId" INTEGER,
ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateIndex
CREATE INDEX "PedidoCliente_repartidorId_estado_idx" ON "public"."PedidoCliente"("repartidorId", "estado");

-- AddForeignKey
ALTER TABLE "public"."PedidoCliente" ADD CONSTRAINT "PedidoCliente_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
