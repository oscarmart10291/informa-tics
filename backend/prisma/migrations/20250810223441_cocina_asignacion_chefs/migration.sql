/*
  Warnings:

  - The `estado` column on the `OrdenItem` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `tipo` column on the `OrdenItem` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."OrdenItemEstado" AS ENUM ('PENDIENTE', 'ASIGNADO', 'PREPARANDO', 'LISTO');

-- CreateEnum
CREATE TYPE "public"."OrdenItemTipo" AS ENUM ('PLATILLO', 'BEBIDA');

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."OrdenItem" ADD COLUMN     "assignedChefId" INTEGER,
ADD COLUMN     "rechazoCount" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "estado",
ADD COLUMN     "estado" "public"."OrdenItemEstado" NOT NULL DEFAULT 'PENDIENTE',
DROP COLUMN "tipo",
ADD COLUMN     "tipo" "public"."OrdenItemTipo" NOT NULL DEFAULT 'PLATILLO';

-- DropEnum
DROP TYPE "public"."ItemEstado";

-- DropEnum
DROP TYPE "public"."ItemTipo";

-- CreateTable
CREATE TABLE "public"."CocinaChef" (
    "id" SERIAL NOT NULL,
    "chefId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CocinaChef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CocinaChef_chefId_key" ON "public"."CocinaChef"("chefId");

-- CreateIndex
CREATE INDEX "OrdenItem_estado_tipo_creadoEn_idx" ON "public"."OrdenItem"("estado", "tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "OrdenItem_assignedChefId_estado_idx" ON "public"."OrdenItem"("assignedChefId", "estado");

-- AddForeignKey
ALTER TABLE "public"."OrdenItem" ADD CONSTRAINT "OrdenItem_assignedChefId_fkey" FOREIGN KEY ("assignedChefId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CocinaChef" ADD CONSTRAINT "CocinaChef_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "public"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
