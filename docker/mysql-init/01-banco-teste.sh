#!/bin/bash
# Cria o banco de teste (<MYSQL_DATABASE>_test) e concede privilégios a MYSQL_USER nele.
# Roda só na primeira subida, com volume vazio (ver docs/arquitetura/comum.md §8).
: "${MYSQL_DATABASE:?MYSQL_DATABASE não definida}"
: "${MYSQL_USER:?MYSQL_USER não definida}"
: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD não definida}"

banco_teste="${MYSQL_DATABASE}_test"
# "_" é curinga em GRANT: escapa para casar só com o nome exato.
banco_teste_grant="${banco_teste//_/\\_}"

mysql --user=root --password="$MYSQL_ROOT_PASSWORD" <<-EOSQL
	CREATE DATABASE IF NOT EXISTS \`${banco_teste}\`;
	GRANT ALL PRIVILEGES ON \`${banco_teste_grant}\`.* TO '${MYSQL_USER}'@'%';
	FLUSH PRIVILEGES;
EOSQL
