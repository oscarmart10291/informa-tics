-- DropForeignKey
ALTER TABLE "public"."HistorialModificacion" DROP CONSTRAINT "HistorialModificacion_usuarioId_fkey";

-- AlterTable
ALTER TABLE "public"."HistorialModificacion" ADD COLUMN     "platilloId" INTEGER,
ALTER COLUMN "usuarioId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."HistorialModificacion" ADD CONSTRAINT "HistorialModificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HistorialModificacion" ADD CONSTRAINT "HistorialModificacion_platilloId_fkey" FOREIGN KEY ("platilloId") REFERENCES "public"."Platillo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
