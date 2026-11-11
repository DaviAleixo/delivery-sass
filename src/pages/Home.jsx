import React, { useState, useEffect } from "react";
import { Settings } from "@/entities/Settings";
import { BannerImage } from "@/entities/BannerImage";
import { Product } from "@/entities/Product";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Clock, MapPin, Phone, Instagram, ChevronRight, Utensils, Heart, Award } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
export default function HomePage() {
  const [settings, setSettings] = useState(null);
  const [banners, setBanners] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    loadData();

    const unsubSettings = Settings.subscribe(() => loadData());
    const unsubBanners = BannerImage.subscribe(() => loadData());
    const unsubProducts = Product.subscribe(() => loadData());

    return () => {
      if (typeof unsubSettings === "function") unsubSettings();
      if (typeof unsubBanners === "function") unsubBanners();
      if (typeof unsubProducts === "function") unsubProducts();
    };
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, bannerData, productsData] = await Promise.all([
        Settings.list(),
        BannerImage.filter({ active: true }, "order_index"),
        Product.filter({ available: true }, "-created_date")
      ]);
      
      if (settingsData.length > 0) setSettings(settingsData[0]);
      setBanners(bannerData);
      setProducts(productsData.slice(0, 6));
    } catch (_error) {
      console.error("Erro ao carregar dados na Home:", _error);
    }
  };

  const testimonials = [
    {
      name: "Maria Silva",
      rating: 5,
      text: "Melhor experiência gastronômica da região! Comida deliciosa e atendimento impecável.",
      image: "👩"
    },
    {
      name: "João Santos",
      rating: 5,
      text: "Ambiente acolhedor e pratos incríveis. Sempre volto e recomendo para todos!",
      image: "👨"
    },
    {
      name: "Ana Costa",
      rating: 5,
      text: "Delivery rápido, comida quentinha e saborosa. Virou meu restaurante favorito!",
      image: "👩‍🦰"
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center">
                {settings?.restaurant_logo ? (
                  <img src={settings.restaurant_logo} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <span className="text-white font-bold text-lg">🍽️</span>
                )}
              </div>
              <span className="text-xl font-bold text-gray-900">{settings?.restaurant_name || "DeliciousEats"}</span>
            </div>
            
            <div className="hidden md:flex items-center gap-6">
              <a href="#sobre" className="text-gray-600 hover:text-red-600 transition-colors">Sobre</a>
              <a href="#galeria" className="text-gray-600 hover:text-red-600 transition-colors">Galeria</a>
              <a href="#depoimentos" className="text-gray-600 hover:text-red-600 transition-colors">Depoimentos</a>
              <a href="#cardapio" className="text-gray-600 hover:text-red-600 transition-colors">Cardápio</a>
            </div>

            <div className="flex items-center gap-3">
              <Link to={createPageUrl("Menu")}>
                <Button className="bg-red-600 hover:bg-red-700 text-white">
                  Ver Cardápio
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          {banners.length > 0 ? (
            <img src={banners[0].image_url} alt="Hero" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700"></div>
          )}
          <div className="absolute inset-0 bg-black/50"></div>
        </div>
        
        <div className="relative z-10 container mx-auto px-4 text-center text-white">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fade-in">
            Sabor que conquista,<br />
            <span className="text-red-400">experiência que encanta</span>
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-2xl mx-auto">
            Descubra o verdadeiro prazer de uma refeição inesquecível
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to={createPageUrl("Menu")}>
              <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white text-lg px-8 py-6">
                Fazer Pedido Agora
                <ChevronRight className="ml-2" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-white border-white hover:bg-white/10 text-lg px-8 py-6">
              Conhecer Cardápio
            </Button>
          </div>
        </div>
      </section>

      {/* Sobre Section */}
      <section id="sobre" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Sobre <span className="text-red-600">{settings?.restaurant_name || "Nós"}</span>
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Há anos trazendo sabor e qualidade para sua mesa. Nossa paixão é transformar cada refeição 
                em uma experiência memorável, combinando ingredientes frescos, receitas autênticas e um 
                atendimento excepcional.
              </p>
              <p className="text-lg text-gray-600 mb-8">
                Acreditamos que boa comida une pessoas e cria momentos especiais. Por isso, nos dedicamos 
                a oferecer pratos que não apenas satisfazem, mas encantam.
              </p>
              
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Utensils className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="font-bold text-gray-900">5000+</p>
                  <p className="text-sm text-gray-600">Pratos Servidos</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Heart className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="font-bold text-gray-900">4.8/5</p>
                  <p className="text-sm text-gray-600">Avaliação</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Award className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="font-bold text-gray-900">3 Anos</p>
                  <p className="text-sm text-gray-600">De Excelência</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {banners.slice(0, 4).map((banner, i) => (
                <div key={i} className="aspect-square rounded-2xl overflow-hidden shadow-lg">
                  <img src={banner.image_url} alt={banner.title} className="w-full h-full object-cover hover:scale-110 transition-transform duration-300" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Galeria Section */}
      <section id="galeria" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Galeria de Sabores</h2>
            <p className="text-lg text-gray-600">Cada prato é uma obra de arte culinária</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product, i) => (
              <div key={i} className="aspect-square rounded-xl overflow-hidden shadow-lg group cursor-pointer">
                <div className="relative w-full h-full">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-4xl">📦</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <div className="text-white">
                      <p className="font-bold">{product.name}</p>
                      <p className="text-sm">R$ {product.price.toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimentos Section */}
      <section id="depoimentos" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">O que dizem nossos clientes</h2>
            <p className="text-lg text-gray-600">Experiências reais de quem já provou</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, i) => (
              <Card key={i} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl">
                      {testimonial.image}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{testimonial.name}</p>
                      <div className="flex gap-1">
                        {[...Array(testimonial.rating)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-600 italic">"{testimonial.text}"</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Cardápio CTA Section */}
      <section id="cardapio" className="py-20 bg-gradient-to-br from-red-600 to-red-800 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Explore Nosso Cardápio Completo</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Descubra uma variedade incrível de pratos preparados com carinho e ingredientes de qualidade
          </p>
          <Link to={createPageUrl("Menu")}>
            <Button size="lg" className="bg-white text-red-600 hover:bg-gray-100 text-lg px-10 py-6">
              Ver Cardápio Completo
              <ChevronRight className="ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Informações de Contato */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Venha nos visitar</h2>
            <p className="text-lg text-gray-600">Ou faça seu pedido com delivery</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {settings?.opening_time && (
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Horário</h3>
                <p className="text-gray-600">{settings.opening_time} às {settings.closing_time}</p>
              </div>
            )}
            
            {settings?.address && (
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Endereço</h3>
                <p className="text-gray-600">{settings.address}</p>
              </div>
            )}
            
            {settings?.phone && (
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Contato</h3>
                <p className="text-gray-600">{settings.phone}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="font-bold text-xl mb-4">{settings?.restaurant_name || "DeliciousEats"}</h3>
              <p className="text-gray-400">
                Transformando refeições em experiências inesquecíveis desde 2021.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold mb-4">Links Rápidos</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#sobre" className="hover:text-white transition-colors">Sobre Nós</a></li>
                <li><a href="#galeria" className="hover:text-white transition-colors">Galeria</a></li>
                <li><Link to={createPageUrl("Menu")} className="hover:text-white transition-colors">Cardápio</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold mb-4">Redes Sociais</h4>
              <div className="flex gap-4">
                {settings?.instagram && (
                  <a href={`https://instagram.com/${settings.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                    <Instagram className="w-5 h-5" />
                  </a>
                )}
                {settings?.whatsapp && (
                  <a href={`https://wa.me/55${settings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                    <Phone className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
            <p>&copy; 2026 {settings?.restaurant_name || "DeliciousEats"}. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}