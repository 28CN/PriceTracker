from dotenv import load_dotenv
load_dotenv('.env.local')
from supabase import create_client
import os

sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

links = sb.table('tracked_links').select('id, retailer, product_id, is_active').execute()
products = sb.table('products').select('id, name').execute()

prod_map = {p['id']: p['name'] for p in products.data}
for l in links.data:
    pname = prod_map.get(l['product_id'], '???')
    print(f"{l['retailer']:15s} active={l['is_active']}  product={pname}  link_id={l['id']}")
