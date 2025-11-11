-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."OrdenItem" ADD COLUMN     "bartenderId" INTEGER;

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."BarraBartender" (
    "id" SERIAL NOT NULL,
    "bartenderId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarraBartender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BarraBartender_bartenderId_key" ON "public"."BarraBartender"("bartenderId");

-- CreateIndex
CREATE INDEX "OrdenItem_bartenderId_estado_idx" ON "public"."OrdenItem"("bartenderId", "estado");

-- AddForeignKey
ALTER TABLE "public"."OrdenItem" ADD CONSTRAINT "OrdenItem_bartenderId_fkey" FOREIGN KEY ("bartenderId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BarraBartender" ADD CONSTRAINT "BarraBartender_bartenderId_fkey" FOREIGN KEY ("bartenderId") REFERENCES "public"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
