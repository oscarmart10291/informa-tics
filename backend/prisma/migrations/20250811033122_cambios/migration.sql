/*
  Warnings:

  - You are about to drop the column `comentario` on the `OrdenItem` table. All the data in the column will be lost.
  - Made the column `precio` on table `OrdenItem` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."OrdenItem" DROP COLUMN "comentario",
ADD COLUMN     "nota" TEXT,
ALTER COLUMN "precio" SET NOT NULL;
