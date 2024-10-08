<?php


namespace Mapbender\CoreBundle\Controller;


use Mapbender\Component\Application\TemplateAssetDependencyInterface;
use Mapbender\CoreBundle\Asset\ApplicationAssetService;
use Mapbender\CoreBundle\Component\Application\ApplicationResolver;
use Mapbender\CoreBundle\Entity\Application;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

class AssetsController extends AbstractController
{
    protected $containerTimestamp;
    protected $cacheDir;
    protected $isDebug;

    public function __construct(protected TranslatorInterface     $translator,
                                protected ApplicationResolver     $applicationResolver,
                                protected ApplicationAssetService $assetService,
                                                                  $containerTimestamp,
                                                                  $cacheDir,
                                                                  $isDebug,
                                protected string                  $templateClass,
                                protected string                  $loginTemplateClass)
    {
        $this->containerTimestamp = intval(ceil($containerTimestamp));
        $this->cacheDir = $cacheDir;
        $this->isDebug = $isDebug;
    }

    /**
     * @param Request $request
     * @param string $slug of Application
     * @param string $type one of 'css', 'js' or 'trans'
     * @return Response
     */
    #[Route(path: '/application/{slug}/assets/{type}', name: 'mapbender_core_application_assets', requirements: ['type' => 'js|css|trans'])]
    #[Route(path: '/application/{slug}/sourcemap/{type}', name: 'mapbender_core_application_sourcemap', requirements: ['type' => 'js|css|trans'])]
    public function assets(Request $request, string $slug, string $type, $_route)
    {
        $cacheFile = $this->getCachePath($request, $slug, $type);
        if ($source = $this->getManagerAssetDependencies($slug)) {
            // @todo: TBD more reasonable criteria of backend / login asset cachability
            $appModificationTs = $this->containerTimestamp;
        } else {
            $source = $this->applicationResolver->getApplicationEntity($slug);
            $appModificationTs = $source->getUpdated()->getTimestamp();
        }
        $cacheFile .= ".{$type}";
        $headers = array(
            'Content-Type' => $this->getMimeType($type),
            'Cache-Control' => 'max-age=0, must-revalidate, private',
        );

        $useCached = (!$this->isDebug) && file_exists($cacheFile);
        if ($useCached && $appModificationTs < filectime($cacheFile)) {
            $response = new BinaryFileResponse($cacheFile, Response::HTTP_OK, $headers);
            // allow file timestamp to be read again correctly for 'Last-Modified' header
            clearstatcache($cacheFile, true);
            $response->isNotModified($request);
            return $response;
        }

        $sourceMap = $_route === 'mapbender_core_application_sourcemap';
        $sourceMapRoute = $this->generateUrl('mapbender_core_application_sourcemap', [
            'slug' => $slug, 'type' => $type
        ]);

        if ($source instanceof Application) {
            $content = $this->assetService->getAssetContent($source, $type, $sourceMap, $sourceMapRoute);
        } else {
            $content = $this->assetService->getBackendAssetContent($source, $type, $sourceMap, $sourceMapRoute);
        }

        if (!$this->isDebug) {
            file_put_contents($cacheFile, $content);
            return new BinaryFileResponse($cacheFile, Response::HTTP_OK, $headers);
        } else {
            return new Response($content, Response::HTTP_OK, $headers);
        }
    }

    /**
     * @param Request $request
     * @param string $slug
     * @param string $type
     * @return string
     */
    protected function getCachePath(Request $request, $slug, $type)
    {
        $path = "{$this->cacheDir}/{$slug}";
        if ($type === 'trans') {
            // Output depends on locale => bake into cache key
            $path .= '.' . $this->translator->getLocale();
        }
        if ($type === 'css') {
            // Output depends on base url of incoming request => bake into cache key
            // 16 bits of entropy should be enough to distinguish '', 'app.php' and 'app_dev.php'
            $baseUrlHash = substr(md5($request->getBaseUrl()), 0, 4);
            $path .= '.' . $baseUrlHash;
        }
        return $path;
    }

    protected function getManagerAssetDependencies(string $slug): ?TemplateAssetDependencyInterface
    {
        switch ($slug) {
            case 'manager':
                return new $this->templateClass();
            case 'mb3-login':
                return new $this->loginTemplateClass();
            default:
                return null;
        }
    }

    /**
     * @param string $type
     * @return string|null
     */
    protected function getMimeType($type)
    {
        switch ($type) {
            case 'js':
            case 'trans':
                return 'application/javascript';
            case 'css':
                return 'text/css';
            default:
                // Uh-oh
                return null;
        }
    }
}
