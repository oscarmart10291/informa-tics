-- CreateEnum
CREATE TYPE "public"."MesaEstado" AS ENUM ('DISPONIBLE', 'OCUPADA', 'RESERVADA');

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."Mesa" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "estado" "public"."MesaEstado" NOT NULL DEFAULT 'DISPONIBLE',
    "reservadaPor" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_numero_key" ON "public"."Mesa"("numero");
