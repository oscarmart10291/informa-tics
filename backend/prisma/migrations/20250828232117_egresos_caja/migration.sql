-- CreateEnum
CREATE TYPE "public"."EgresoEstado" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."EgresoCaja" (
    "id" SERIAL NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "public"."EgresoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "cajeroId" INTEGER NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT NOT NULL,
    "autorizadoPorId" INTEGER,
    "autorizadoEn" TIMESTAMP(3),
    "observacion" TEXT,

    CONSTRAINT "EgresoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EgresoCaja_creadoEn_idx" ON "public"."EgresoCaja"("creadoEn");

-- CreateIndex
CREATE INDEX "EgresoCaja_estado_idx" ON "public"."EgresoCaja"("estado");

-- CreateIndex
CREATE INDEX "EgresoCaja_cajeroId_idx" ON "public"."EgresoCaja"("cajeroId");

-- CreateIndex
CREATE INDEX "EgresoCaja_autorizadoPorId_idx" ON "public"."EgresoCaja"("autorizadoPorId");

-- AddForeignKey
ALTER TABLE "public"."EgresoCaja" ADD CONSTRAINT "EgresoCaja_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "public"."Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EgresoCaja" ADD CONSTRAINT "EgresoCaja_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
