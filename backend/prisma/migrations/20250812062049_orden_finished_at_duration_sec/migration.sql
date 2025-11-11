-- AlterTable
ALTER TABLE "public"."Orden" ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateIndex
CREATE INDEX "Orden_fecha_idx" ON "public"."Orden"("fecha");

-- CreateIndex
CREATE INDEX "Orden_finishedAt_idx" ON "public"."Orden"("finishedAt");

-- CreateIndex
CREATE INDEX "OrdenItem_ordenId_tipo_estado_idx" ON "public"."OrdenItem"("ordenId", "tipo", "estado");
