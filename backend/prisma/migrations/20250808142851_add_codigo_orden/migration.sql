/*
  Warnings:

  - A unique constraint covering the columns `[codigo]` on the table `Orden` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Orden" ADD COLUMN     "codigo" VARCHAR(5) NOT NULL DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateIndex
CREATE UNIQUE INDEX "Orden_codigo_key" ON "public"."Orden"("codigo");
