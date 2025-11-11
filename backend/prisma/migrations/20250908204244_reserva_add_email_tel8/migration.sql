/*
  Warnings:

  - You are about to alter the column `telefono` on the `Reserva` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(8)`.
  - Added the required column `email` to the `Reserva` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."Reserva" ADD COLUMN     "email" TEXT NOT NULL,
ALTER COLUMN "telefono" SET DATA TYPE VARCHAR(8);
