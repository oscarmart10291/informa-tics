-- CreateEnum
CREATE TYPE "public"."ReservaEstado" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'CUMPLIDA');

-- CreateEnum
CREATE TYPE "public"."PagoEstado" AS ENUM ('PENDIENTE', 'PAGADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "public"."RefundEstado" AS ENUM ('NO_APLICA', 'PENDIENTE', 'PROCESADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."Reserva" (
    "id" SERIAL NOT NULL,
    "mesaId" INTEGER NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "nota" TEXT,
    "monto" DECIMAL(65,30) NOT NULL DEFAULT 50.00,
    "estado" "public"."ReservaEstado" NOT NULL DEFAULT 'PENDIENTE',
    "pagoEstado" "public"."PagoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "pagoMetodo" TEXT NOT NULL DEFAULT 'ONLINE',
    "pagoReferencia" TEXT,
    "pagadoEn" TIMESTAMP(3),
    "canceladaEn" TIMESTAMP(3),
    "refundEstado" "public"."RefundEstado" NOT NULL DEFAULT 'NO_APLICA',
    "refundMonto" DECIMAL(65,30),
    "refundEn" TIMESTAMP(3),
    "refundMotivo" TEXT,
    "verificadaPorMeseroId" INTEGER,
    "verificadaEn" TIMESTAMP(3),
    "aplicadoEnOrdenId" INTEGER,
    "aplicadoEnPagoId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reserva_mesaId_fechaHora_idx" ON "public"."Reserva"("mesaId", "fechaHora");

-- CreateIndex
CREATE INDEX "Reserva_estado_pagoEstado_idx" ON "public"."Reserva"("estado", "pagoEstado");

-- AddForeignKey
ALTER TABLE "public"."Reserva" ADD CONSTRAINT "Reserva_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "public"."Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
