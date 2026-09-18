{
    'name': 'Pressing - Point of Sale',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'author': 'Méthode',
    'website': 'https://methode.dev',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'data/laundry_treatment_data.xml',
        'views/laundry_treatment_views.xml',
        'views/product_views.xml',
        'views/pos_order_views.xml',
        'views/pos_config_views.xml',
        'views/res_config_settings_views.xml',
        # Last: it builds the pressing shop, and the scenario it loads refers
        # to products and categories, not to anything declared above.
        'data/pressing_store_data.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'addons_pressing_pos/static/src/app/**/*.js',
            'addons_pressing_pos/static/src/app/**/*.xml',
            'addons_pressing_pos/static/src/scss/*.scss',
        ],
    },
    'installable': True,
}
