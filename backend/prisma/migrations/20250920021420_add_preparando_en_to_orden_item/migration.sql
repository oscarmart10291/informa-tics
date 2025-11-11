-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."OrdenItem" ADD COLUMN     "preparandoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateIndex
CREATE INDEX "OrdenItem_preparandoEn_idx" ON "public"."OrdenItem"("preparandoEn");
