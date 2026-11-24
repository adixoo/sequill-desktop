-- Database: template1

CREATE TYPE address AS (street text, zip character varying(10));

CREATE TYPE mood AS ENUM ('sad', 'happy');

CREATE DOMAIN email AS text CHECK ((VALUE ~ '@'::text));

CREATE SEQUENCE customer_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;

CREATE SEQUENCE invoice_no AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000;

CREATE TABLE customer (
  id integer DEFAULT nextval('customer_id_seq'::regclass) NOT NULL,
  mail email NOT NULL,
  home address,
  created timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_mail_key UNIQUE (mail),
  CONSTRAINT customer_pkey PRIMARY KEY (id)
);

CREATE TABLE ticket (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  customer_id integer NOT NULL,
  feeling mood NOT NULL,
  tags text[],
  total numeric(10,2) DEFAULT 0,
  doubled numeric GENERATED ALWAYS AS ((total * (2)::numeric)) STORED,
  inv integer DEFAULT nextval('invoice_no'::regclass),
  CONSTRAINT ticket_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_total_check CHECK ((total >= (0)::numeric))
);

ALTER TABLE ticket ADD CONSTRAINT ticket_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customer(id) ON DELETE CASCADE;

CREATE INDEX ticket_feeling ON public.ticket USING btree (feeling) WHERE (total > (0)::numeric);

CREATE OR REPLACE PROCEDURE public.noop()
 LANGUAGE sql
AS $procedure$ SELECT 1 $procedure$
;

CREATE OR REPLACE FUNCTION public.stamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.tags := '{}'; RETURN NEW; END $function$
;

CREATE VIEW sad_tickets AS
 SELECT id,
    customer_id,
    feeling,
    tags,
    total,
    doubled,
    inv
   FROM ticket
  WHERE feeling = 'sad'::mood;

CREATE MATERIALIZED VIEW totals AS
 SELECT customer_id,
    sum(total) AS sum
   FROM ticket
  GROUP BY customer_id;

CREATE TRIGGER ticket_stamp BEFORE INSERT ON ticket FOR EACH ROW EXECUTE FUNCTION stamp();