-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."Platillo" ADD COLUMN     "imagenUrl" TEXT;

-- CreateTable
CREATE TABLE "public"."Permiso" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PermisoPorRol" (
    "id" SERIAL NOT NULL,
    "permisoId" INTEGER NOT NULL,
    "rolId" INTEGER NOT NULL,

    CONSTRAINT "PermisoPorRol_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permiso_nombre_key" ON "public"."Permiso"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoPorRol_permisoId_rolId_key" ON "public"."PermisoPorRol"("permisoId", "rolId");

-- AddForeignKey
ALTER TABLE "public"."PermisoPorRol" ADD CONSTRAINT "PermisoPorRol_permisoId_fkey" FOREIGN KEY ("permisoId") REFERENCES "public"."Permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PermisoPorRol" ADD CONSTRAINT "PermisoPorRol_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "public"."Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
