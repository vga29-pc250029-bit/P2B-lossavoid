-- Add only the fields required by the existing web screens. No business data is imported.
DECLARE
    object_count NUMBER;
    PROCEDURE add_column_if_missing(table_name_in VARCHAR2, column_name_in VARCHAR2, definition_in VARCHAR2) IS
        column_count NUMBER;
    BEGIN
        SELECT COUNT(*) INTO column_count FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = table_name_in AND COLUMN_NAME = column_name_in;
        IF column_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE ' || table_name_in || ' ADD (' || column_name_in || ' ' || definition_in || ')';
        END IF;
    END;
    PROCEDURE add_sequence_if_missing(sequence_name_in VARCHAR2, table_name_in VARCHAR2, id_column_in VARCHAR2) IS
        sequence_count NUMBER;
        next_id NUMBER;
    BEGIN
        SELECT COUNT(*) INTO sequence_count FROM USER_SEQUENCES WHERE SEQUENCE_NAME = sequence_name_in;
        IF sequence_count = 0 THEN
            EXECUTE IMMEDIATE 'SELECT NVL(MAX(' || id_column_in || '), 0) + 1 FROM ' || table_name_in INTO next_id;
            EXECUTE IMMEDIATE 'CREATE SEQUENCE ' || sequence_name_in || ' START WITH ' || next_id || ' INCREMENT BY 1 NOCACHE';
        END IF;
    END;
BEGIN
    add_column_if_missing('MENUS', 'PREP_STATION', 'VARCHAR2(20) DEFAULT ''kitchen'' NOT NULL');
    add_column_if_missing('MENUS', 'STOCK_QTY', 'NUMBER(8)');
    add_column_if_missing('MENUS', 'SOLD_OUT', 'NUMBER(1) DEFAULT 0 NOT NULL');
    add_column_if_missing('ORDERS', 'ORDER_METHOD', 'VARCHAR2(40)');
    add_column_if_missing('ORDERS', 'UPDATED_AT', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL');
    add_column_if_missing('STAFFS', 'STAFF_CODE', 'VARCHAR2(20)');

    EXECUTE IMMEDIATE 'UPDATE STAFFS SET STAFF_CODE = TO_CHAR(STAFF_ID) WHERE STAFF_CODE IS NULL';
    SELECT COUNT(*) INTO object_count FROM USER_INDEXES WHERE INDEX_NAME = 'UX_STAFFS_CODE';
    IF object_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UX_STAFFS_CODE ON STAFFS (UPPER(STAFF_CODE))';
    END IF;

    SELECT COUNT(*) INTO object_count FROM USER_TABLES WHERE TABLE_NAME = 'ORDER_DETAILS';
    IF object_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE ORDER_DETAILS (
            ORDER_DETAIL_ID NUMBER(10) PRIMARY KEY,
            ORDER_ID NUMBER(10) NOT NULL,
            MENU_ID NUMBER(10) NOT NULL,
            MENU_NAME VARCHAR2(100) NOT NULL,
            PRICE NUMBER(8) NOT NULL,
            QUANTITY NUMBER(5) NOT NULL,
            SERVED NUMBER(1) DEFAULT 0 NOT NULL,
            SERVED_AT TIMESTAMP,
            NOTE VARCHAR2(400),
            CONSTRAINT FK_DETAILS_ORDER FOREIGN KEY (ORDER_ID) REFERENCES ORDERS (ORDER_ID),
            CONSTRAINT FK_DETAILS_MENU FOREIGN KEY (MENU_ID) REFERENCES MENUS (MENU_ID))';
    END IF;

    SELECT COUNT(*) INTO object_count FROM USER_CONSTRAINTS WHERE CONSTRAINT_NAME = 'FK_TASK_ORDER_DETAIL';
    IF object_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE COOKING_TASKS ADD CONSTRAINT FK_TASK_ORDER_DETAIL
            FOREIGN KEY (ORDER_DETAIL_ID) REFERENCES ORDER_DETAILS (ORDER_DETAIL_ID)';
    END IF;

    add_sequence_if_missing('SEQ_CUSTOMERS', 'CUSTOMERS', 'CUSTOMER_ID');
    add_sequence_if_missing('SEQ_ORDERS', 'ORDERS', 'ORDER_ID');
    add_sequence_if_missing('SEQ_ORDER_DETAILS', 'ORDER_DETAILS', 'ORDER_DETAIL_ID');
    add_sequence_if_missing('SEQ_COOKING_TASKS', 'COOKING_TASKS', 'TASK_ID');
    add_sequence_if_missing('SEQ_STAFFS', 'STAFFS', 'STAFF_ID');
END;
/
