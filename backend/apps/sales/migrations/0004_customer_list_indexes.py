from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("sales", "0003_pos_sale_index_cleanup"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="order",
            index=models.Index(fields=["customer", "status", "created_at"], name="orders_cust_st_created_idx"),
        ),
        migrations.AddIndex(
            model_name="possale",
            index=models.Index(fields=["customer", "sales_line", "created_at"], name="pos_cust_line_created_idx"),
        ),
        migrations.RunSQL(
            sql="""
                CREATE INDEX IF NOT EXISTS orders_qual_cust_idx
                ON orders (customer_id, created_at)
                WHERE status NOT IN ('canceled', 'failed', 'wait_for_payment');
                CREATE INDEX IF NOT EXISTS pos_sales_qual_cust_idx
                ON pos_sales (customer_id, sales_line, created_at)
                WHERE deleted_at IS NULL AND is_cancelled = FALSE AND type <> 'refund';
            """,
            reverse_sql="""
                DROP INDEX IF EXISTS orders_qual_cust_idx;
                DROP INDEX IF EXISTS pos_sales_qual_cust_idx;
            """,
        ),
    ]
