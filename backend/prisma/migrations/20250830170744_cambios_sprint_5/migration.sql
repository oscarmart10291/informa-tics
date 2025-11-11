-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."MeseroNotif" (
    "id" SERIAL NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visto" BOOLEAN NOT NULL DEFAULT false,
    "ordenId" INTEGER NOT NULL,
    "itemNombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "meseroId" INTEGER,

    CONSTRAINT "MeseroNotif_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeseroNotif_meseroId_visto_creadoEn_idx" ON "public"."MeseroNotif"("meseroId", "visto", "creadoEn");

-- CreateIndex
CREATE INDEX "MeseroNotif_ordenId_creadoEn_idx" ON "public"."MeseroNotif"("ordenId", "creadoEn");

-- AddForeignKey
ALTER TABLE "public"."MeseroNotif" ADD CONSTRAINT "MeseroNotif_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "public"."Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeseroNotif" ADD CONSTRAINT "MeseroNotif_meseroId_fkey" FOREIGN KEY ("meseroId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
