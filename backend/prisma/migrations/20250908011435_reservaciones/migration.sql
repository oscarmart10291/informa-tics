/*
  Warnings:

  - Added the required column `hastaHora` to the `Reserva` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Reserva_mesaId_fechaHora_idx";

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."Reserva" ADD COLUMN     "hastaHora" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Reserva_mesaId_fechaHora_hastaHora_idx" ON "public"."Reserva"("mesaId", "fechaHora", "hastaHora");
