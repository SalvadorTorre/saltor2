/*
 Navicat Premium Dump SQL

 Source Server         : grupohierro-ii
 Source Server Type    : MySQL
 Source Server Version : 80044 (8.0.44)
 Source Host           : 167.99.102.209:3306
 Source Schema         : myappdb

 Target Server Type    : MySQL
 Target Server Version : 80044 (8.0.44)
 File Encoding         : 65001

 Date: 07/04/2026 11:04:52
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for CotizacionCounter
-- ----------------------------
DROP TABLE IF EXISTS `CotizacionCounter`;
CREATE TABLE `CotizacionCounter`  (
  `year` int NOT NULL,
  `last_number` int NOT NULL,
  PRIMARY KEY (`year`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for DetFactura
-- ----------------------------
DROP TABLE IF EXISTS `DetFactura`;
CREATE TABLE `DetFactura`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `df_codFact` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `df_fecFact` date NULL DEFAULT NULL,
  `df_codMerc` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `df_tipoMerc` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_codGrupo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_desMerc` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_canMerc` decimal(10, 2) NULL DEFAULT NULL,
  `df_preMerc` decimal(10, 2) NULL DEFAULT NULL,
  `df_valMerc` decimal(12, 2) NULL DEFAULT NULL,
  `df_unidad` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_cosMerc` decimal(10, 2) NULL DEFAULT NULL,
  `df_codClie` decimal(5, 0) NULL DEFAULT NULL,
  `df_imp` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_status` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `enviado` decimal(1, 0) NULL DEFAULT NULL,
  `reimpresa` decimal(1, 0) NULL DEFAULT NULL,
  `df_nomClie` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_codEpr` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_codSucu` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_pendiente` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_canpend` decimal(10, 2) NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `DetFactura_ibfk_1`(`df_codFact` ASC) USING BTREE,
  CONSTRAINT `DetFactura_ibfk_1` FOREIGN KEY (`df_codFact`) REFERENCES `factura` (`fa_codFact`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 171 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for Usuario
-- ----------------------------
DROP TABLE IF EXISTS `Usuario`;
CREATE TABLE `Usuario`  (
  `codUsuario` int NOT NULL AUTO_INCREMENT,
  `idUsuario` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `claveUsuario` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `nombreUsuario` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `nivel` int NULL DEFAULT NULL,
  `metaVenta` decimal(5, 2) NULL DEFAULT NULL,
  `correo` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `claveCorreo` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `sucursalid` int NULL DEFAULT NULL,
  `idtipoUsuario` int NULL DEFAULT NULL,
  `idpermiso` int NULL DEFAULT NULL,
  `cod_empre` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`codUsuario`) USING BTREE,
  UNIQUE INDEX `claveUsuario`(`claveUsuario` ASC) USING BTREE,
  INDEX `Usuario_cod_empre_fkey`(`cod_empre` ASC) USING BTREE,
  INDEX `Usuario_sucursalid_fkey`(`sucursalid` ASC) USING BTREE,
  INDEX `Usuario_idtipoUsuario_fkey`(`idtipoUsuario` ASC) USING BTREE,
  CONSTRAINT `Usuario_cod_empre_fkey` FOREIGN KEY (`cod_empre`) REFERENCES `empresas` (`cod_empre`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Usuario_idtipoUsuario_fkey` FOREIGN KEY (`idtipoUsuario`) REFERENCES `tipousuario` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Usuario_sucursalid_fkey` FOREIGN KEY (`sucursalid`) REFERENCES `sucursales` (`cod_sucursal`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 20 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for choferes
-- ----------------------------
DROP TABLE IF EXISTS `choferes`;
CREATE TABLE `choferes`  (
  `id` int NOT NULL,
  `codChofer` int NOT NULL AUTO_INCREMENT,
  `nomChofer` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `cedChofer` char(11) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `statusChofer` bit(1) NULL DEFAULT NULL,
  PRIMARY KEY (`codChofer`, `id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 7 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for cierrecaja
-- ----------------------------
DROP TABLE IF EXISTS `cierrecaja`;
CREATE TABLE `cierrecaja`  (
  `idcierre` int NOT NULL AUTO_INCREMENT,
  `feccierre` date NULL DEFAULT NULL,
  `tefectivo` decimal(12, 2) NULL DEFAULT NULL,
  `ttarjeta` decimal(12, 2) NULL DEFAULT NULL,
  `tdeposito` decimal(12, 2) NULL DEFAULT NULL,
  `totalcierre` decimal(12, 2) NULL DEFAULT NULL,
  `tcheque` decimal(12, 2) NULL DEFAULT NULL,
  `factini` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `factfin` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `cajera` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `nota` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`idcierre`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 4 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for clientes
-- ----------------------------
DROP TABLE IF EXISTS `clientes`;
CREATE TABLE `clientes`  (
  `cl_codClie` int NOT NULL AUTO_INCREMENT,
  `cl_nomClie` varchar(35) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `cl_dirClie` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `cl_codSect` int NULL DEFAULT NULL,
  `cl_codZona` int NULL DEFAULT NULL,
  `cl_telClie` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `cl_tipo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `cl_status` bit(1) NULL DEFAULT NULL,
  `cl_rnc` int NULL DEFAULT NULL,
  `cl_codsucursal` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`cl_codClie`) USING BTREE,
  INDEX `fk_clientes_sector`(`cl_codSect` ASC) USING BTREE,
  INDEX `fk_clientes_zona`(`cl_codZona` ASC) USING BTREE,
  CONSTRAINT `fk_clientes_sector` FOREIGN KEY (`cl_codSect`) REFERENCES `sector` (`se_codSect`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_clientes_zona` FOREIGN KEY (`cl_codZona`) REFERENCES `zona` (`zo_codZona`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 18 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for contfactura
-- ----------------------------
DROP TABLE IF EXISTS `contfactura`;
CREATE TABLE `contfactura`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `idsucursal` int NULL DEFAULT NULL,
  `ano` int NULL DEFAULT NULL,
  `contador` int NULL DEFAULT NULL,
  `contsalida` int NULL DEFAULT NULL,
  `contentrada` int NULL DEFAULT NULL,
  `contvinterna` int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `contfactura_idsucursal_fkey`(`idsucursal` ASC) USING BTREE,
  CONSTRAINT `contfactura_idsucursal_fkey` FOREIGN KEY (`idsucursal`) REFERENCES `sucursales` (`cod_sucursal`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 20 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for cotizacion
-- ----------------------------
DROP TABLE IF EXISTS `cotizacion`;
CREATE TABLE `cotizacion`  (
  `ct_codcoti` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `ct_feccoti` date NULL DEFAULT NULL,
  `ct_valcoti` decimal(9, 2) NULL DEFAULT NULL,
  `ct_itbis` decimal(9, 2) NULL DEFAULT NULL,
  `ct_codclie` int NULL DEFAULT NULL,
  `ct_nomclie` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ct_rnc` char(11) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ct_telclie` char(17) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ct_dirclie` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ct_correo` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ct_codvend` char(5) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ct_nomvend` char(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ct_nota` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `ct_status` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ct_codEmpr` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ct_cod_sucu` int NULL DEFAULT NULL,
  PRIMARY KEY (`ct_codcoti`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for ctr_factura
-- ----------------------------
DROP TABLE IF EXISTS `ctr_factura`;
CREATE TABLE `ctr_factura`  (
  `year` decimal(10, 0) NOT NULL COMMENT 'Año de Facturacion',
  `last_number` decimal(10, 0) NULL DEFAULT NULL COMMENT 'No. de Factura',
  `control` decimal(10, 0) NULL DEFAULT NULL COMMENT 'Control para el manejos de general numero de factura',
  `ncfvalorf` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'No. de comprovante con valor fiscal',
  `fecvalorf` date NULL DEFAULT NULL COMMENT 'Fecha Valida de los comprovante de valor Fiscal',
  `cantncfvalorf` decimal(10, 0) NULL DEFAULT NULL COMMENT 'Cantidad de comprovante o el ultimo comprovante asignado con valor fiscal',
  `ctrvalorf` decimal(10, 0) NULL DEFAULT NULL COMMENT 'Seccuencia o control de los comprovante de valor fiscal',
  `ncfconsumo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'No. de comprovante de consumo',
  `cantconsumo` decimal(10, 0) NULL DEFAULT NULL COMMENT 'Cantidad de comprovante o el ultimo comprovante asignado de consumo',
  `ctrconsumo` decimal(10, 0) NULL DEFAULT NULL COMMENT 'Seccuencia o control de los comprovante de consumidor final',
  `ncfespecial` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'No. de comprovante de regimen especial',
  `fecespecial` date NULL DEFAULT NULL COMMENT 'Fecha Valida de los comprovante de regimen especial',
  `cantespecial` decimal(10, 0) NULL DEFAULT NULL COMMENT 'Cantidad de comprovante o el ultimo comprovante asignado de regimen especial',
  `ctrespecial` decimal(10, 0) NULL DEFAULT NULL COMMENT 'Seccuencia o control de los comprovante de regimen especial',
  `ncfguberna` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT 'gubernamentales',
  `fecguberna` date NULL DEFAULT NULL COMMENT 'Fecha Valida de los comprovante de gubernamentales',
  `cantguberna` decimal(10, 0) NULL DEFAULT NULL COMMENT 'Cantidad de comprovante o el ultimo comprovante asignado gubernamelates',
  `ctrguberna` decimal(10, 0) NULL DEFAULT NULL COMMENT 'Seccuencia o control de los comprovante gubernamentales',
  `ctr_ini` decimal(10, 0) NULL DEFAULT NULL,
  `ctr_fin` decimal(10, 0) NULL DEFAULT NULL,
  `ctr_f` decimal(10, 0) NULL DEFAULT NULL,
  `ctr_t` decimal(10, 0) NULL DEFAULT NULL,
  PRIMARY KEY (`year`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for despachadores
-- ----------------------------
DROP TABLE IF EXISTS `despachadores`;
CREATE TABLE `despachadores`  (
  `CodDesp` int NOT NULL AUTO_INCREMENT,
  `nomDesp` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `tipoDesp` char(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `statusDespachadores` bit(1) NULL DEFAULT NULL,
  `cedDesp` varchar(11) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`CodDesp`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 4 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for detcotizacion
-- ----------------------------
DROP TABLE IF EXISTS `detcotizacion`;
CREATE TABLE `detcotizacion`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `dc_codcoti` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `dc_codmerc` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `dc_descrip` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `dc_canmerc` decimal(10, 2) NULL DEFAULT NULL,
  `dc_premerc` decimal(9, 2) NULL DEFAULT NULL,
  `dc_valmerc` decimal(10, 2) NULL DEFAULT NULL,
  `dc_unidad` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `dc_costmer` decimal(10, 2) NULL DEFAULT NULL,
  `dc_codclie` int NULL DEFAULT NULL,
  `dc_item` int NULL DEFAULT NULL,
  `dc_status` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `dc_codEmpr` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `dc_codSucu` int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `detcotizacion_ibfk_1`(`dc_codcoti` ASC) USING BTREE,
  CONSTRAINT `detcotizacion_ibfk_1` FOREIGN KEY (`dc_codcoti`) REFERENCES `cotizacion` (`ct_codcoti`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for detentradamerc
-- ----------------------------
DROP TABLE IF EXISTS `detentradamerc`;
CREATE TABLE `detentradamerc`  (
  `de_codEntr` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `de_codMerc` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `de_desMerc` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `de_canEntr` decimal(8, 2) NULL DEFAULT NULL,
  `de_preMerc` decimal(9, 2) NULL DEFAULT NULL,
  `de_valEntr` decimal(10, 2) NULL DEFAULT NULL,
  `de_unidad` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `de_cosMerc` decimal(10, 2) NULL DEFAULT NULL,
  `de_codSupl` decimal(7, 0) NULL DEFAULT NULL,
  `de_fecEntr` date NULL DEFAULT NULL,
  `de_codEmpr` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `de_codSucu` int NULL DEFAULT NULL,
  `de_tipo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`de_codEntr`, `de_codMerc`) USING BTREE,
  CONSTRAINT `detentradamerc_ibfk_1` FOREIGN KEY (`de_codEntr`) REFERENCES `entradamerc` (`me_codEntr`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for detsalida
-- ----------------------------
DROP TABLE IF EXISTS `detsalida`;
CREATE TABLE `detsalida`  (
  `idsalida` int NOT NULL,
  `idsucursal` int NULL DEFAULT NULL,
  `codSalida` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `codFact` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `fecFact` date NULL DEFAULT NULL,
  `nomClie` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `valFact` decimal(10, 2) NULL DEFAULT NULL,
  `codChofer` decimal(10, 0) NULL DEFAULT NULL,
  `nomChofer` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `valAbono` decimal(10, 2) NULL DEFAULT NULL,
  `devolucion` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `valDevolucion` decimal(10, 2) NULL DEFAULT NULL,
  `entregada` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `pagado` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `status` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `imp` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`codSalida`, `codFact`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for detventainterna
-- ----------------------------
DROP TABLE IF EXISTS `detventainterna`;
CREATE TABLE `detventainterna`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `df_codFact` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `df_fecFact` date NULL DEFAULT NULL,
  `df_codMerc` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `df_tipoMerc` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_codGrupo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_desMerc` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_canMerc` decimal(10, 2) NOT NULL,
  `df_preMerc` decimal(10, 2) NOT NULL,
  `df_valMerc` decimal(12, 2) NULL DEFAULT NULL,
  `df_unidad` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_cosMerc` decimal(10, 2) NULL DEFAULT NULL,
  `df_codClie` decimal(5, 0) NULL DEFAULT NULL,
  `df_status` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_nomClie` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_codEmpr` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `df_codSucu` int NULL DEFAULT NULL,
  `df_tipo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 47 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for devolucion
-- ----------------------------
DROP TABLE IF EXISTS `devolucion`;
CREATE TABLE `devolucion`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `fecha` datetime NULL DEFAULT NULL,
  `codentrada` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `codsalida` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for dtipousuario
-- ----------------------------
DROP TABLE IF EXISTS `dtipousuario`;
CREATE TABLE `dtipousuario`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `idtipousuario` int NULL DEFAULT NULL,
  `idmodulo` int NULL DEFAULT NULL,
  `lectura` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `acceso` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `dtipousuario_idtipousuario_fkey`(`idtipousuario` ASC) USING BTREE,
  INDEX `dtipousuario_idmodulo_fkey`(`idmodulo` ASC) USING BTREE,
  CONSTRAINT `dtipousuario_idmodulo_fkey` FOREIGN KEY (`idmodulo`) REFERENCES `modulo` (`idmodulo`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `dtipousuario_idtipousuario_fkey` FOREIGN KEY (`idtipousuario`) REFERENCES `tipousuario` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 7 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for empresas
-- ----------------------------
DROP TABLE IF EXISTS `empresas`;
CREATE TABLE `empresas`  (
  `cod_empre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `nom_empre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `dir_empre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `tel_empre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `rnc_empre` varchar(13) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `letra_empre` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`cod_empre`) USING BTREE,
  INDEX `cod_empre`(`cod_empre` ASC) USING BTREE,
  INDEX `cod_empre_2`(`cod_empre` ASC) USING BTREE,
  INDEX `cod_empre_3`(`cod_empre` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for encf
-- ----------------------------
DROP TABLE IF EXISTS `encf`;
CREATE TABLE `encf`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `cantencf` decimal(10, 0) NULL DEFAULT NULL,
  `countencf` decimal(10, 0) NULL DEFAULT NULL,
  `alertaencf` decimal(10, 0) NULL DEFAULT NULL,
  `codempr` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `desdeencf` decimal(10, 0) NULL DEFAULT NULL,
  `fechaencf` date NULL DEFAULT NULL,
  `hastaencf` decimal(10, 0) NULL DEFAULT NULL,
  `tipoencf` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `tipo` int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `encf_codempr_fkey`(`codempr` ASC) USING BTREE,
  CONSTRAINT `encf_codempr_fkey` FOREIGN KEY (`codempr`) REFERENCES `empresas` (`cod_empre`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 12 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for entradamerc
-- ----------------------------
DROP TABLE IF EXISTS `entradamerc`;
CREATE TABLE `entradamerc`  (
  `me_codEntr` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `me_fecEntr` date NULL DEFAULT NULL,
  `me_valEntr` decimal(10, 2) NULL DEFAULT NULL,
  `me_codSupl` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `me_nomSupl` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `me_facSupl` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `me_fecSupl` date NULL DEFAULT NULL,
  `me_status` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `me_codVend` varchar(5) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `me_nomVend` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `imgfactura` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `nota` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `vendedor` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `despachado` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `chofer` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `me_rncSupl` int NULL DEFAULT NULL,
  `me_codEmpr` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `me_codSucu` int NULL DEFAULT NULL,
  `me_tipo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`me_codEntr`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for entradamercCounter
-- ----------------------------
DROP TABLE IF EXISTS `entradamercCounter`;
CREATE TABLE `entradamercCounter`  (
  `year` int NOT NULL,
  `last_number` int NOT NULL,
  PRIMARY KEY (`year`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for factura
-- ----------------------------
DROP TABLE IF EXISTS `factura`;
CREATE TABLE `factura`  (
  `fa_codFact` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `fa_ncfFact` varchar(19) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_rncFact` varchar(13) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_fecNcf` date NULL DEFAULT NULL,
  `fa_tipoNcf` int NULL DEFAULT NULL,
  `fa_fecFact` date NULL DEFAULT NULL,
  `fa_fecHora` datetime NULL DEFAULT NULL,
  `fa_valFact` decimal(12, 2) NULL DEFAULT NULL,
  `fa_itbiFact` decimal(12, 2) NULL DEFAULT NULL,
  `fa_subFact` decimal(12, 2) NULL DEFAULT NULL,
  `fa_desFact` decimal(10, 2) NULL DEFAULT NULL,
  `fa_cosFact` decimal(12, 2) NULL DEFAULT NULL,
  `fa_aboFact` decimal(12, 2) NULL DEFAULT NULL,
  `fa_expFact` date NULL DEFAULT NULL,
  `fa_codClie` int NULL DEFAULT NULL,
  `fa_nomClie` varchar(39) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_telClie` varchar(26) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_dirClie` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_contacto` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_codZona` int NULL DEFAULT NULL,
  `fa_desZona` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_codSect` int NULL DEFAULT NULL,
  `fa_sector` varchar(35) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_codVend` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_nomVend` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_notaFact` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `fa_usuario` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_envio` int NULL DEFAULT NULL,
  `fa_fpago` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_codfpago` int NULL DEFAULT NULL,
  `fa_status` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_tipoFact` int NULL DEFAULT NULL,
  `fa_imp` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_tipoRnc` int NULL DEFAULT NULL,
  `fa_fecha` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_codSucu` int NULL DEFAULT NULL,
  `fa_fehora` datetime NULL DEFAULT NULL,
  `fa_correo` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_codEmpr` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_impresa` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_reimpresa` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_entrega` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_impalmaf` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_impalmap` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_facturada` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_pendiente` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_despacho` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `estado_dgii` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `codseguridad` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `qr_link` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fec_firma` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `ECF` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `RFCE` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  `estado_envio_dgii` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_cierre` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_salida` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `idsalida` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`fa_codFact`) USING BTREE,
  INDEX `factura_fa_codfpago_fkey`(`fa_codfpago` ASC) USING BTREE,
  INDEX `factura_fa_envio_fkey`(`fa_envio` ASC) USING BTREE,
  CONSTRAINT `factura_fa_codfpago_fkey` FOREIGN KEY (`fa_codfpago`) REFERENCES `fpago` (`fp_codfpago`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `factura_fa_envio_fkey` FOREIGN KEY (`fa_envio`) REFERENCES `fentrega` (`idfentrega`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for fentrega
-- ----------------------------
DROP TABLE IF EXISTS `fentrega`;
CREATE TABLE `fentrega`  (
  `idfentrega` int NOT NULL AUTO_INCREMENT,
  `desentrega` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`idfentrega`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 3 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for fpago
-- ----------------------------
DROP TABLE IF EXISTS `fpago`;
CREATE TABLE `fpago`  (
  `fp_codfpago` int NOT NULL AUTO_INCREMENT,
  `fp_descfpago` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`fp_codfpago`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 7 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for grupomerc
-- ----------------------------
DROP TABLE IF EXISTS `grupomerc`;
CREATE TABLE `grupomerc`  (
  `Codgrupo` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Descgrupo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Tipomerc` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`Codgrupo`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for inventario
-- ----------------------------
DROP TABLE IF EXISTS `inventario`;
CREATE TABLE `inventario`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `inv_codsucu` int NOT NULL,
  `inv_codprod` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `inv_desprod` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `inv_cosprod` decimal(12, 2) NULL DEFAULT NULL,
  `inv_preprod` decimal(12, 2) NULL DEFAULT NULL,
  `inv_existencia` decimal(10, 2) NULL DEFAULT NULL,
  `inv_fechamov` datetime NULL DEFAULT NULL,
  PRIMARY KEY (`id` DESC, `inv_codsucu` DESC, `inv_codprod`) USING BTREE,
  UNIQUE INDEX `sucursal_producto`(`inv_codsucu` ASC, `inv_codprod` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 28 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for modulo
-- ----------------------------
DROP TABLE IF EXISTS `modulo`;
CREATE TABLE `modulo`  (
  `idmodulo` int NOT NULL AUTO_INCREMENT,
  `descmodulo` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `scceso` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `lectura` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`idmodulo`) USING BTREE,
  INDEX `idmodulo`(`idmodulo` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 4 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for permiso
-- ----------------------------
DROP TABLE IF EXISTS `permiso`;
CREATE TABLE `permiso`  (
  `idpermiso` int NOT NULL AUTO_INCREMENT,
  `codusuario` int NULL DEFAULT NULL,
  `idmodulo` int NULL DEFAULT NULL,
  `acceso` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `lectura` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`idpermiso`) USING BTREE,
  INDEX `permiso_idmodulo_fkey`(`idmodulo` ASC) USING BTREE,
  INDEX `permiso_codusuario_fkey`(`codusuario` ASC) USING BTREE,
  CONSTRAINT `permiso_codusuario_fkey` FOREIGN KEY (`codusuario`) REFERENCES `Usuario` (`codUsuario`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `permiso_idmodulo_fkey` FOREIGN KEY (`idmodulo`) REFERENCES `modulo` (`idmodulo`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 13 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for productos2
-- ----------------------------
DROP TABLE IF EXISTS `productos2`;
CREATE TABLE `productos2`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `in_codmerc` varchar(15) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL,
  `in_categor` varchar(4) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL,
  `in_tramo` varchar(8) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL,
  `in_desmerc` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL,
  `in_canmerc` double NULL DEFAULT NULL,
  `in_caninve` double NULL DEFAULT NULL,
  `in_fecinve` date NULL DEFAULT NULL,
  `in_eximini` double NULL DEFAULT NULL,
  `in_minvent` double NULL DEFAULT NULL,
  `in_costmer` double NULL DEFAULT NULL,
  `in_precmin` double NULL DEFAULT NULL,
  `in_premerc` double NULL DEFAULT NULL,
  `in_costpro` double NULL DEFAULT NULL,
  `in_ucosto` double NULL DEFAULT NULL,
  `in_porgana` double NULL DEFAULT NULL,
  `in_peso` double NULL DEFAULT NULL,
  `media` varchar(1) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL,
  `in_longitu` double NULL DEFAULT NULL,
  `in_unidad` varchar(8) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL,
  `in_fecmodi` date NULL DEFAULT NULL,
  `in_almacen` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL,
  `imagen` text CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL,
  `in_exento` tinyint(1) NULL DEFAULT NULL,
  `contror` tinyint(1) NULL DEFAULT NULL,
  `atualisar` tinyint(1) NULL DEFAULT NULL,
  `suma` double NULL DEFAULT NULL,
  `existencia` double NULL DEFAULT NULL,
  `salida` double NULL DEFAULT NULL,
  `status` varchar(1) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 3264 CHARACTER SET = utf8mb3 COLLATE = utf8mb3_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for recibo
-- ----------------------------
DROP TABLE IF EXISTS `recibo`;
CREATE TABLE `recibo`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `fecha` datetime NULL DEFAULT NULL,
  `cantidad` decimal(12, 2) NULL DEFAULT NULL,
  `nombre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `concepto` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fpago` int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 5 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for rnc
-- ----------------------------
DROP TABLE IF EXISTS `rnc`;
CREATE TABLE `rnc`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `rnc` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `rason` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `status` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `rnc`(`rnc` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 764717 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for salida
-- ----------------------------
DROP TABLE IF EXISTS `salida`;
CREATE TABLE `salida`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `idsucursal` int NULL DEFAULT NULL,
  `codSalida` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fecSalida` date NULL DEFAULT NULL,
  `horaSalida` datetime NULL DEFAULT NULL,
  `canFact` int NULL DEFAULT NULL,
  `valFact` decimal(10, 2) NULL DEFAULT NULL,
  `valPagado` decimal(10, 2) NULL DEFAULT NULL,
  `valDevolucion` decimal(10, 2) NULL DEFAULT NULL,
  `codChofer` int NULL DEFAULT NULL,
  `nomChofer` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `cedChofer` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `status` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `envia` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `idusuario` int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 62 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for sector
-- ----------------------------
DROP TABLE IF EXISTS `sector`;
CREATE TABLE `sector`  (
  `se_codSect` int NOT NULL AUTO_INCREMENT,
  `se_desSect` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `se_codZona` int NULL DEFAULT NULL,
  `idsucursal` int NULL DEFAULT NULL,
  PRIMARY KEY (`se_codSect`) USING BTREE,
  INDEX `se_codZona`(`se_codZona` ASC) USING BTREE,
  INDEX `sector_idsucursal_fkey`(`idsucursal` ASC) USING BTREE,
  CONSTRAINT `sector_ibfk_1` FOREIGN KEY (`se_codZona`) REFERENCES `zona` (`zo_codZona`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `sector_idsucursal_fkey` FOREIGN KEY (`idsucursal`) REFERENCES `sucursales` (`cod_sucursal`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 16 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for sucursales
-- ----------------------------
DROP TABLE IF EXISTS `sucursales`;
CREATE TABLE `sucursales`  (
  `cod_sucursal` int NOT NULL AUTO_INCREMENT,
  `nom_sucursal` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Zona` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `cod_empre` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `dir_sucursal` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `tel_sucursal` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`cod_sucursal`) USING BTREE,
  INDEX `cod_empre`(`cod_empre` ASC) USING BTREE,
  CONSTRAINT `sucursales_cod_empre_fkey` FOREIGN KEY (`cod_empre`) REFERENCES `empresas` (`cod_empre`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 23 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for suplidor
-- ----------------------------
DROP TABLE IF EXISTS `suplidor`;
CREATE TABLE `suplidor`  (
  `su_codSupl` int NOT NULL AUTO_INCREMENT,
  `su_nomSupl` varchar(35) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `su_rncSupl` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `su_dirSupl` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `su_telSupl` varchar(26) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `su_contact` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `su_status` bit(1) NULL DEFAULT b'1',
  PRIMARY KEY (`su_codSupl`) USING BTREE,
  UNIQUE INDEX `su_rncsupl`(`su_rncSupl` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 16 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for tiponcf
-- ----------------------------
DROP TABLE IF EXISTS `tiponcf`;
CREATE TABLE `tiponcf`  (
  `idNcf` int NOT NULL AUTO_INCREMENT,
  `desNcf` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `tipo` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `codigo` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`idNcf`) USING BTREE,
  UNIQUE INDEX `uk_tiponcf`(`tipo` ASC, `codigo` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 16 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for tipousuario
-- ----------------------------
DROP TABLE IF EXISTS `tipousuario`;
CREATE TABLE `tipousuario`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `descripcion` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 6 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for ventainterna
-- ----------------------------
DROP TABLE IF EXISTS `ventainterna`;
CREATE TABLE `ventainterna`  (
  `fa_codFact` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `fa_fecFact` date NULL DEFAULT NULL,
  `fa_valFact` decimal(12, 2) NULL DEFAULT NULL,
  `fa_itbiFact` decimal(12, 2) NULL DEFAULT NULL,
  `fa_subFact` decimal(12, 2) NULL DEFAULT NULL,
  `fa_cosFact` decimal(12, 2) NULL DEFAULT NULL,
  `fa_codClie` int NULL DEFAULT NULL,
  `fa_nomClie` varchar(39) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_telClie` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_dirClie` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_codVend` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_nomVend` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_usuario` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_status` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_solicitud` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_codEmpr` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  `fa_codSucu` int NULL DEFAULT NULL,
  `fa_tipo` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL,
  PRIMARY KEY (`fa_codFact`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for ventainternaCounter
-- ----------------------------
DROP TABLE IF EXISTS `ventainternaCounter`;
CREATE TABLE `ventainternaCounter`  (
  `year` int NOT NULL,
  `last_number` int NOT NULL,
  PRIMARY KEY (`year`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for zona
-- ----------------------------
DROP TABLE IF EXISTS `zona`;
CREATE TABLE `zona`  (
  `zo_codZona` int NOT NULL AUTO_INCREMENT,
  `zo_descrip` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`zo_codZona`) USING BTREE,
  INDEX `zo_codZona`(`zo_codZona` ASC) USING BTREE,
  INDEX `zo_codZona_2`(`zo_codZona` ASC) USING BTREE,
  INDEX `zo_codZona_3`(`zo_codZona` ASC) USING BTREE,
  INDEX `zo_codZona_4`(`zo_codZona` ASC) USING BTREE,
  INDEX `zo_codZona_5`(`zo_codZona` ASC) USING BTREE,
  INDEX `zo_codZona_6`(`zo_codZona` ASC) USING BTREE,
  INDEX `zo_codZona_7`(`zo_codZona` ASC) USING BTREE,
  INDEX `zo_codZona_8`(`zo_codZona` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 8 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = DYNAMIC;

SET FOREIGN_KEY_CHECKS = 1;
