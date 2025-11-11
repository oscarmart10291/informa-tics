-- AlterTable
ALTER TABLE "public"."CajaTurno" ADD COLUMN     "conteoInicial" JSONB;

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateIndex
CREATE INDEX "CajaTurno_autorizadoPorId_idx" ON "public"."CajaTurno"("autorizadoPorId");
