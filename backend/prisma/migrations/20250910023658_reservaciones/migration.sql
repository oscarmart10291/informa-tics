-- AlterTable
ALTER TABLE "public"."Mesa" ADD COLUMN     "activa" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateIndex
CREATE INDEX "Mesa_activa_idx" ON "public"."Mesa"("activa");
