-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."RepartidorNotif" (
    "id" SERIAL NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visto" BOOLEAN NOT NULL DEFAULT false,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT,
    "repartidorId" INTEGER,
    "pedidoId" INTEGER,

    CONSTRAINT "RepartidorNotif_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepartidorNotif_repartidorId_visto_creadoEn_idx" ON "public"."RepartidorNotif"("repartidorId", "visto", "creadoEn");

-- CreateIndex
CREATE INDEX "RepartidorNotif_pedidoId_creadoEn_idx" ON "public"."RepartidorNotif"("pedidoId", "creadoEn");

-- AddForeignKey
ALTER TABLE "public"."RepartidorNotif" ADD CONSTRAINT "RepartidorNotif_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RepartidorNotif" ADD CONSTRAINT "RepartidorNotif_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "public"."PedidoCliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
