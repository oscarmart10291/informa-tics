/*
  Warnings:

  - You are about to drop the column `assignedChefId` on the `OrdenItem` table. All the data in the column will be lost.
  - You are about to drop the column `nota` on the `OrdenItem` table. All the data in the column will be lost.
  - You are about to drop the column `precio` on the `OrdenItem` table. All the data in the column will be lost.
  - You are about to drop the column `rechazoCount` on the `OrdenItem` table. All the data in the column will be lost.
  - Changed the type of `estado` on the `OrdenItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `tipo` on the `OrdenItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "public"."OrdenItem" DROP CONSTRAINT "OrdenItem_assignedChefId_fkey";

-- DropIndex
DROP INDEX "public"."OrdenItem_assignedChefId_estado_idx";

-- DropIndex
DROP INDEX "public"."OrdenItem_estado_tipo_creadoEn_idx";

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."OrdenItem" DROP COLUMN "assignedChefId",
DROP COLUMN "nota",
DROP COLUMN "precio",
DROP COLUMN "rechazoCount",
ADD COLUMN     "asignadoEn" TIMESTAMP(3),
ADD COLUMN     "chefId" INTEGER,
ADD COLUMN     "comentario" TEXT,
ADD COLUMN     "finalizadoEn" TIMESTAMP(3),
ADD COLUMN     "prioridad" INTEGER,
DROP COLUMN "estado",
ADD COLUMN     "estado" TEXT NOT NULL,
DROP COLUMN "tipo",
ADD COLUMN     "tipo" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "OrdenItem_chefId_estado_idx" ON "public"."OrdenItem"("chefId", "estado");

-- AddForeignKey
ALTER TABLE "public"."OrdenItem" ADD CONSTRAINT "OrdenItem_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
