-- CreateEnum
CREATE TYPE "public"."CajaTurnoEstado" AS ENUM ('PENDIENTE', 'ABIERTA', 'RECHAZADA', 'CERRADA');

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."OrdenItem" ADD COLUMN     "pagado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."CajaTurno" (
    "id" SERIAL NOT NULL,
    "cajeroId" INTEGER NOT NULL,
    "estado" "public"."CajaTurnoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "montoApertura" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "solicitadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autorizadoPorId" INTEGER,
    "autorizadoEn" TIMESTAMP(3),
    "cerradoEn" TIMESTAMP(3),

    CONSTRAINT "CajaTurno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CajaTurno_cajeroId_estado_idx" ON "public"."CajaTurno"("cajeroId", "estado");

-- CreateIndex
CREATE INDEX "CajaTurno_estado_solicitadoEn_idx" ON "public"."CajaTurno"("estado", "solicitadoEn");

-- CreateIndex
CREATE INDEX "OrdenItem_pagado_idx" ON "public"."OrdenItem"("pagado");

-- AddForeignKey
ALTER TABLE "public"."CajaTurno" ADD CONSTRAINT "CajaTurno_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "public"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CajaTurno" ADD CONSTRAINT "CajaTurno_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
